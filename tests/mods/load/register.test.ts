/**
 * plugins/mods/reference.md § Events > Other mods (`plugin.register`), plugins/mods/admin.md §
 * Enforce a policy with a mod of your own and § Refuse mods when your check fails,
 * plugins/mods/events.md § Handle a hook that fails (a refusal after `next` still holds),
 * plugins/mods/test.md § Test a policy mod (the message of a refused mod), plugins/mods/troubleshoot.md
 * § The mod doesn't load (the debug log lines).
 */
import { expect, test } from 'bun:test';
import type { RegisterFunction } from '../../../src/testing/mods/index.ts';
import {
  inline,
  installed,
  managed,
  modPlugin,
  organizations,
  registerOf,
  session,
} from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

const BLOCKED_CALLS = ['process.run', 'process.spawn'];

type Event = { tier: string; plugin: string; uses: { calls: string[] } };
type Hook = ($: unknown, e: Event, next: (e: unknown) => Promise<unknown>) => Promise<unknown>;

// The policy mod of the admin page, as `acme-guard/hooks/register.js`.
const acmeGuard = registerOf((on) => {
  on('plugin.register', (async (_$: unknown, e: Event, next: (e: unknown) => Promise<unknown>) => {
    const blocked = e.uses.calls.filter((call) => BLOCKED_CALLS.includes(call));
    if (e.tier === 'user' && blocked.length > 0) {
      return { refuse: 'Acme policy: mods may not call ' + blocked.join(', ') };
    }
    return next(e);
  }) satisfies Hook);
});

const runner = registerOf((on) => {
  on('tool.call', async ($: { process: { run(a: string[]): Promise<unknown> } }) => {
    await $.process.run(['ls']);
    return { result: 'runner answered' };
  });
});

const reader = registerOf((on) => {
  on('tool.call', async () => ({ result: 'reader answered' }));
});

const policy = managed({ prependPlugins: ['acme-guard@acme-tools'] });
const load = async (
  registers: Record<string, RegisterFunction>,
  ...mods: ReturnType<typeof modPlugin>[]
) => {
  const s = session(registers, { policy });
  const report = await s.host.load(mods);
  return { ...s, report };
};

spec('mods.event.plugin.register', () => {
  test("a mod in prependPlugins refuses a user's mod that calls $.process.run: the line names both and the reason", async () => {
    const { report, host, debug } = await load(
      { 'acme-guard': acmeGuard, runner },
      modPlugin(organizations('acme-guard'), acmeGuard),
      modPlugin(installed('runner'), runner),
    );
    expect(report.loaded.map((mod) => mod.name)).toEqual(['acme-guard']);
    const line = 'runner: refused by acme-guard: Acme policy: mods may not call process.run';
    expect(report.lines).toEqual([line]);
    expect(debug).toContain(line);
    // the refused mod's hooks never run: Claude Code's own answer reaches the caller
    const out = await host.fire(
      'tool.call',
      { tool: 'Bash' },
      { core: () => Promise.resolve({ result: 'claude code' }) },
    );
    expect(out).toEqual({ result: 'claude code' });
  });

  test('every other mod loads and runs: the hook passes it on with next(e)', async () => {
    const { report, host } = await load(
      { 'acme-guard': acmeGuard, reader },
      modPlugin(organizations('acme-guard'), acmeGuard),
      modPlugin(installed('reader'), reader),
    );
    expect(report.lines).toEqual([]);
    expect(report.loaded.map((mod) => mod.name)).toEqual(['acme-guard', 'reader']);
    expect(await host.fire('tool.call', { tool: 'Bash' })).toEqual({ result: 'reader answered' });
  });

  test("e.tier is where the mod would run: prepend for the organization's, append for the appended, user, builtin; the organization's own mod may call what a user's may not", async () => {
    const seen: Record<string, string> = {};
    const spy = registerOf((on) => {
      on(
        'plugin.register',
        async (_$: unknown, e: Event, next: (e: unknown) => Promise<unknown>) => {
          seen[e.plugin] = e.tier;
          return next(e);
        },
      );
    });
    const builtinMod = { ...installed('agents-md'), isBuiltin: true, id: 'agents-md@builtin' };
    const s = session(
      { spy, 'acme-tool': runner, late: reader, 'user-mod': reader, 'agents-md': reader },
      {
        policy: managed({
          prependPlugins: ['spy@acme-tools'],
          appendPlugins: ['late@acme-tools'],
        }),
      },
    );
    const report = await s.host.load([
      modPlugin(organizations('spy'), spy),
      modPlugin(organizations('late'), reader),
      modPlugin(organizations('acme-tool'), runner),
      modPlugin(installed('user-mod'), reader),
      modPlugin(builtinMod, reader),
    ]);
    expect(seen).toEqual({
      'acme-tool': 'prepend',
      'user-mod': 'user',
      late: 'append',
      'agents-md': 'builtin',
    });
    // the organization's mod calls process.run and is not refused: nothing refuses a mod here
    expect(report.lines).toEqual([]);
    expect(report.loaded.map((mod) => mod.name)).toEqual([
      'spy',
      'acme-tool',
      'user-mod',
      'late',
      'agents-md',
    ]);
  });

  test("e.uses lists the mod's events, mods API calls without the $. prefix, environment variables and state", async () => {
    const seen: unknown[] = [];
    const spy = registerOf((on) => {
      on(
        'plugin.register',
        async (_$: unknown, e: Event, next: (e: unknown) => Promise<unknown>) => {
          seen.push(e);
          return next(e);
        },
      );
    });
    const subject = registerOf((on) => {
      on(
        'tool.call',
        { tool: 'Bash' },
        async (
          $: {
            fs: { read(p: string): Promise<unknown> };
            env: { get(n: string): Promise<unknown> };
          },
          e: unknown,
          next: (e: unknown) => Promise<unknown>,
        ) => {
          await $.fs.read('notes.md');
          await $.env.get('HOME');
          return next(e);
        },
      );
    });
    await load(
      { spy, subject },
      modPlugin(organizations('spy'), spy),
      modPlugin(installed('subject'), subject),
    );
    expect(seen).toEqual([
      {
        plugin: 'subject',
        tier: 'user',
        uses: {
          events: ['tool.call{tool=Bash}'],
          calls: ['fs.read', 'env.get'],
          envReads: ['HOME'],
          envWrites: [],
          stateReads: [],
          stateWrites: [],
        },
      },
    ]);
  });

  test('a hook that throws is skipped, so the check fails open; a .catch handler that returns the refusal fails closed', async () => {
    const throwing = registerOf((on) => {
      on('plugin.register', async () => {
        throw new Error('boom');
      });
    });
    const open = await load(
      { 'acme-guard': throwing, runner },
      modPlugin(organizations('acme-guard'), throwing),
      modPlugin(installed('runner'), runner),
    );
    expect(open.report.loaded.map((mod) => mod.name)).toEqual(['acme-guard', 'runner']);
    expect(open.reports.map((r) => r.line)).toEqual([
      'acme-guard: plugin.register hook skipped: threw Error: boom',
    ]);

    const closed = registerOf((on) => {
      on('plugin.register', async () => {
        throw new Error('boom');
      }).catch(async (_$: unknown, e: Event, next: (e: unknown) => Promise<unknown>) => {
        if (e.tier !== 'user') return next(e);
        return { refuse: 'Acme policy check failed, so this mod was not loaded' };
      });
    });
    const shut = await load(
      { 'acme-guard': closed, runner, acme: reader },
      modPlugin(organizations('acme-guard'), closed),
      modPlugin(installed('runner'), runner),
      modPlugin(organizations('acme'), reader),
    );
    expect(shut.report.lines).toEqual([
      'runner: refused by acme-guard: Acme policy check failed, so this mod was not loaded',
    ]);
    expect(shut.report.loaded.map((mod) => mod.name)).toEqual(['acme-guard', 'acme']);
  });

  test('a refusal returned after next resolved still holds', async () => {
    const after = registerOf((on) => {
      on(
        'plugin.register',
        async (_$: unknown, e: unknown, next: (e: unknown) => Promise<unknown>) => {
          await next(e);
          return { refuse: 'after next' };
        },
      );
    });
    const { report } = await load(
      { 'acme-guard': after, reader },
      modPlugin(organizations('acme-guard'), after),
      modPlugin(installed('reader'), reader),
    );
    expect(report.lines).toEqual(['reader: refused by acme-guard: after next']);
  });

  test("a mod loaded with --plugin-dir is a user's mod too: its tier is user", async () => {
    const { report } = await load(
      { 'acme-guard': acmeGuard, runner },
      modPlugin(organizations('acme-guard'), acmeGuard),
      modPlugin(inline('runner'), runner),
    );
    expect(report.lines).toEqual([
      'runner: refused by acme-guard: Acme policy: mods may not call process.run',
    ]);
  });
});

test('judgment: an answer that is not { refuse: string } fails the hook like a throw, and the mod loads', async () => {
  const wrong = registerOf((on) => {
    on('plugin.register', async () => ({ refuse: 3 }));
  });
  const { report, reports } = await load(
    { 'acme-guard': wrong, reader },
    modPlugin(organizations('acme-guard'), wrong),
    modPlugin(installed('reader'), reader),
  );
  expect(report.loaded.map((mod) => mod.name)).toEqual(['acme-guard', 'reader']);
  expect(reports[0]?.reason).toContain('returned the wrong shape');
});
