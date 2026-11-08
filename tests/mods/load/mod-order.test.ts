/**
 * plugins/mods/events.md § Run alongside other mods: "The order mods run in" and "Where settings
 * hooks run in the order". The docs' own list, end to end: a host loads the mods, and the hooks of
 * one event run in the order the page gives.
 */
import { expect, test } from 'bun:test';
import type { ModCandidate } from '../../../src/mods/load/index.ts';
import { fakePorts } from '../../../src/testing/mods/index.ts';
import { fn, harness } from '../../support/mods-chain.ts';
import {
  installed,
  managed,
  modPlugin,
  organizations,
  registerOf,
  session,
} from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

type Next = (e: unknown) => Promise<unknown>;
const trace: string[] = [];
/** A hooks module whose `tool.call` hook notes when it is reached and when `next` comes back. */
const tracing = (label: string) =>
  registerOf((on) => {
    on('tool.call', async (_$: unknown, e: unknown, next: Next) => {
      trace.push(`${label} in`);
      const result = await next(e);
      trace.push(`${label} out`);
      return result;
    });
  });

spec(
  [
    'mods.events.The order mods run in',
    'policy.mods.Know what happens by default.A built-in guard runs first',
  ],
  () => {
    const names = ['acme-guard', 'user-a', 'user-b', 'acme-late'];

    test('the organization first, then the mods you install, then appendPlugins, then the mods built into Claude Code', async () => {
      trace.length = 0;
      const registers = Object.fromEntries(names.map((name) => [name, tracing(name)]));
      const { host } = session(registers, {
        policy: managed({ appendPlugins: ['acme-late@acme-tools'] }),
        firesSessionStart: false,
        ports: fakePorts().ports,
      });
      await host.registerBuiltIn('native', 'builtin', [
        {
          event: 'tool.call',
          isGenerator: false,
          run: async (_$, e, next) => {
            trace.push('native in');
            const result = await next(e);
            trace.push('native out');
            return result;
          },
        },
      ]);
      await host.load([
        modPlugin(organizations('acme-late'), tracing('acme-late')),
        modPlugin(installed('user-a'), tracing('user-a')),
        modPlugin(installed('user-b'), tracing('user-b')),
        modPlugin(organizations('acme-guard'), tracing('acme-guard')),
      ]);
      await host.fire('tool.call', { tool: 'Bash', input: {} });
      expect(trace).toEqual([
        'acme-guard in',
        'user-a in',
        'user-b in',
        'acme-late in',
        'native in',
        'native out',
        'acme-late out',
        'user-b out',
        'user-a out',
        'acme-guard out',
      ]);
    });

    test('the organization mods in prependPlugins run first, then any other organization mod that is not in appendPlugins', async () => {
      trace.length = 0;
      const { host } = session(
        { 'other-org': tracing('other-org'), x: tracing('x'), 'user-a': tracing('user-a') },
        { policy: managed({ prependPlugins: ['x@acme-tools'] }), firesSessionStart: false },
      );
      await host.load([
        modPlugin(organizations('other-org'), tracing('other-org')),
        modPlugin(installed('user-a'), tracing('user-a')),
        modPlugin(organizations('x'), tracing('x')),
      ]);
      await host.fire('tool.call', { tool: 'Bash', input: {} });
      // `other-org` was given first, and `x` is listed in prependPlugins: `x` runs ahead of it
      expect(trace.filter((line) => line.endsWith(' in'))).toEqual([
        'x in',
        'other-org in',
        'user-a in',
      ]);
    });

    test('the built-in guard sec-default@builtin is first of all, ahead of the organization mods: it answers before an organization mod sees the registration', async () => {
      const seen: string[] = [];
      const watcher = registerOf((on) => {
        on('plugin.register', async (_$: unknown, e: { plugin: string }, next: Next) => {
          seen.push(e.plugin);
          return next(e);
        });
      });
      const load = async (policy: ReturnType<typeof managed>) => {
        seen.length = 0;
        const { host } = session(
          { 'acme-guard': watcher, 'user-a': tracing('user-a') },
          { policy, firesSessionStart: false },
        );
        await host.load([
          modPlugin(organizations('acme-guard'), watcher),
          modPlugin(installed('user-a'), tracing('user-a')),
        ]);
        return host.active().map((mod) => mod.id);
      };
      const limited = managed({
        pluginConfigs: {
          'cc-plugin-sec-default@builtin': { options: { allowManagedModsOnly: true } },
        },
      });
      // the guard refuses the user's mod itself, so the organization's mod never sees it
      expect(await load(limited)).toEqual(['sec-default@builtin', 'acme-guard@acme-tools']);
      expect(seen).toEqual([]);
      // without that option the guard passes it on, and the organization's mod sees it second
      expect(await load(managed())).toEqual([
        'sec-default@builtin',
        'acme-guard@acme-tools',
        'user-a@market',
      ]);
      expect(seen).toEqual(['user-a']);
    });

    test('among the mods you install, a mod runs before the mods it lists under dependencies', async () => {
      trace.length = 0;
      const needs = (name: string, ...dependencies: string[]): ModCandidate => ({
        ...installed(name),
        dependencies,
      });
      const { host } = session(
        { lib: tracing('lib'), app: tracing('app') },
        { firesSessionStart: false },
      );
      await host.load([
        modPlugin(needs('lib'), tracing('lib')),
        modPlugin(needs('app', 'lib'), tracing('app')),
      ]);
      await host.fire('tool.call', { tool: 'Bash', input: {} });
      expect(trace.filter((line) => line.endsWith(' in'))).toEqual(['app in', 'lib in']);
    });

    test('within one module, hooks run in the order register called on', async () => {
      trace.length = 0;
      const register = registerOf((on) => {
        on('tool.call', async (_$: unknown, e: unknown, next: Next) => {
          trace.push('first');
          return next(e);
        });
        on('tool.call', { tool: 'Bash' }, async (_$: unknown, e: unknown, next: Next) => {
          trace.push('second');
          return next(e);
        });
      });
      const { host } = session({ 'my-mod': register }, { firesSessionStart: false });
      await host.load([modPlugin(installed('my-mod'), register)]);
      await host.fire('tool.call', { tool: 'Bash', input: {} });
      expect(trace).toEqual(['first', 'second']);
    });

    test('the first mod is outermost: it sees the event before the others and the result after them, and a later mod cannot stop it seeing the event', () => {
      const h = harness();
      const seen: string[] = [];
      h.mod('outer', 'user', [
        fn('tool.call', async (_$, e, next) => {
          seen.push('outer sees the event');
          const result = await next(e);
          seen.push(`outer sees ${JSON.stringify(result)}`);
          return result;
        }),
      ]);
      h.mod('inner', 'user', [fn('tool.call', () => ({ deny: 'no' }))]);
      return h.fire('tool.call', { tool: 'Bash' }).then(() => {
        expect(seen).toEqual(['outer sees the event', 'outer sees {"deny":"no"}']);
        // the mod that answers keeps Claude Code's own behaviour from running
        expect(h.coreSeen).toEqual([]);
      });
    });

    test('the first mod decides whether the others run at all', async () => {
      const h = harness();
      const ran: string[] = [];
      h.mod('outer', 'user', [fn('tool.call', () => ({ deny: 'stop' }))]);
      h.mod('inner', 'user', [fn('tool.call', (_$, e, next) => (ran.push('inner'), next(e)))]);
      await h.fire('tool.call', { tool: 'Bash' });
      expect(ran).toEqual([]);
    });
  },
);
