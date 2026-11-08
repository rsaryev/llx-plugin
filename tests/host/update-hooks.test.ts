/**
 * What `host.update` does to the hooks an open session registered (hooks.md, "Hooks in skills and
 * agents": a skill's hooks "keep running for the rest of the session", `once: true` removes a hook
 * after its first successful run; "Limits on skill hooks": 1,024 hooks and 16,384 matcher
 * characters per source of skills; "FileChanged": the watch list): the hooks of a plugin that is
 * gone leave, the others and their `once` keys stay, and the limit counters follow the survivors.
 * Integration tests of the host, outside `spec()`; what survives is a row in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import type { PluginSession } from '../../src/host/index.ts';
import type { HooksSettings } from '../../src/protocol/hook-config.ts';
import { createPolicyView } from '../../src/settings/index.ts';
import { hostOf, SESSION, signal } from '../support/host.ts';
import { layerOf } from '../support/settings-layers.ts';
import {
  BASH,
  bashGuard,
  commandsRun,
  hostPlugin,
  pluginOf,
  skillText,
} from '../support/host-update.ts';

const GUARDED = 'guarded@acme';
const OTHER = 'other@acme';

const ONCE = [
  'hooks:',
  '  PostToolUse:',
  '    - hooks:',
  '        - type: command',
  '          command: /bin/audit-once',
  '          once: true',
];

const CHECK = [
  'hooks:',
  '  PreToolUse:',
  '    - matcher: "Bash"',
  '      hooks:',
  '        - type: command',
  '          command: /bin/skill-check',
];

const done = { ...BASH, tool_response: {}, duration_ms: 1 };

/** A skill with `count` hooks in one `Bash` group, as one line of flow YAML. */
const manyHooks = (count: number): readonly string[] => [
  `hooks: ${JSON.stringify({
    PreToolUse: [
      {
        matcher: 'Bash',
        hooks: Array.from({ length: count }, () => ({ type: 'command', command: '/bin/many' })),
      },
    ],
  })}`,
];

async function guarded() {
  return pluginOf('guarded', {
    skills: {
      secure: skillText('Secure', CHECK),
      audit: skillText('Audit', ONCE),
      big1: skillText('Big one', manyHooks(600)),
      big2: skillText('Big two', manyHooks(600)),
    },
  });
}

async function setup(runs = 12) {
  const fixture = await hostOf({
    plugins: [hostPlugin(GUARDED, await guarded()), hostPlugin(OTHER, await pluginOf('other'))],
    runs: Array.from({ length: runs }, () => ({})),
  });
  return { ...fixture, session: fixture.host.openSession(SESSION) };
}

const expand = async (session: PluginSession, name: string) => {
  const expansion = await session.expandSkill(name, { signal: signal() });
  return { ok: expansion.ok, issues: expansion.issues };
};

/**
 * Uses the session, so it takes up the update made so far. A session refreshes lazily, at its next
 * use, and two updates before that use count as one (spec/judgments.md).
 */
const settle = (session: PluginSession): void => {
  session.hasHooks('Stop');
};

const without = (...ids: string[]) => ({
  settings: createPolicyView([
    layerOf('user', { enabledPlugins: Object.fromEntries(ids.map((id) => [id, false])) }),
  ]),
});

describe('disabling a plugin drops the hooks its skills registered', () => {
  test('they do not come back when the plugin is enabled again: the skill must be invoked again', async () => {
    const { host, session, runner } = await setup();
    await expand(session, 'guarded:secure');
    await session.dispatch('PreToolUse', BASH, { signal: signal() });
    expect(commandsRun(runner)).toEqual(['/bin/skill-check']);
    host.update(without(GUARDED));
    await session.dispatch('PreToolUse', BASH, { signal: signal() });
    host.update({ settings: createPolicyView([]) });
    await session.dispatch('PreToolUse', BASH, { signal: signal() });
    expect(commandsRun(runner)).toEqual(['/bin/skill-check']);
    await expand(session, 'guarded:secure');
    await session.dispatch('PreToolUse', BASH, { signal: signal() });
    expect(commandsRun(runner)).toEqual(['/bin/skill-check', '/bin/skill-check']);
  });

  test('hasHooks sees it at once', async () => {
    const { host, session } = await setup();
    await expand(session, 'guarded:secure');
    expect(session.hasHooks('PreToolUse')).toBe(true);
    host.update({ plugins: [hostPlugin(OTHER, await pluginOf('other'))] });
    expect(session.hasHooks('PreToolUse')).toBe(false);
  });

  test('a plugin removed from the list drops them too', async () => {
    const { host, session } = await setup();
    await expand(session, 'guarded:secure');
    host.update({ plugins: [hostPlugin(OTHER, await pluginOf('other'))] });
    settle(session);
    host.update({ plugins: [hostPlugin(GUARDED, await guarded())] });
    expect(session.hasHooks('PreToolUse')).toBe(false);
  });
});

describe('updates coalesce until the session is used', () => {
  test('a plugin removed and added back before the session is used never left it: its hooks stay', async () => {
    const { host, session } = await setup();
    await expand(session, 'guarded:secure');
    host.update(without(GUARDED));
    host.update({ settings: createPolicyView([]) });
    expect(session.hasHooks('PreToolUse')).toBe(true);
  });
});

describe('a plugin that stays keeps its skill hooks and once keys', () => {
  test('the skill hooks keep running after an update that changes another plugin', async () => {
    const { host, session, runner } = await setup();
    await expand(session, 'guarded:secure');
    host.update({ plugins: [hostPlugin(GUARDED, await guarded())] });
    await session.dispatch('PreToolUse', BASH, { signal: signal() });
    expect(commandsRun(runner)).toEqual(['/bin/skill-check']);
  });

  test('a once hook that ran stays consumed: the update does not bring it back', async () => {
    const { host, session, runner } = await setup();
    await expand(session, 'guarded:audit');
    await session.dispatch('PostToolUse', done, { signal: signal() });
    expect(commandsRun(runner)).toEqual(['/bin/audit-once']);
    host.update({ settings: createPolicyView([]) });
    await session.dispatch('PostToolUse', done, { signal: signal() });
    expect(commandsRun(runner)).toEqual(['/bin/audit-once']);
  });

  test('a once hook that has not run yet is still there and runs once', async () => {
    const { host, session, runner } = await setup();
    await expand(session, 'guarded:audit');
    host.update({ plugins: [hostPlugin(GUARDED, await guarded())] });
    await session.dispatch('PostToolUse', done, { signal: signal() });
    await session.dispatch('PostToolUse', done, { signal: signal() });
    expect(commandsRun(runner)).toEqual(['/bin/audit-once']);
  });

  test('the handle of a registration made before the update still removes it', async () => {
    const { host, session } = await setup();
    const handle = session.addHooks('run:1', bashGuard('/bin/run'), {
      kind: 'session',
      label: '[run]',
    });
    host.update({ settings: createPolicyView([]) });
    expect(session.hasHooks('PreToolUse')).toBe(true);
    handle.remove();
    expect(session.hasHooks('PreToolUse')).toBe(false);
  });
});

describe('scoped hooks of addHooks over an update', () => {
  const AGENT = { kind: 'agent', label: '[agent]' } as const;
  const RUN = { kind: 'session', label: '[run]' } as const;

  test('hooks of an agent that belong to a plugin that is gone are dropped, the others stay', async () => {
    const { host, session, runner } = await setup();
    session.addHooks('agent:mine', bashGuard('/bin/mine'), AGENT, { pluginId: GUARDED });
    session.addHooks('agent:free', bashGuard('/bin/free'), AGENT);
    session.addHooks('run:1', bashGuard('/bin/run'), RUN);
    host.update(without(GUARDED));
    settle(session);
    host.update({ settings: createPolicyView([]) });
    await session.dispatch('PreToolUse', BASH, { signal: signal() });
    expect(commandsRun(runner).toSorted((a, b) => String(a).localeCompare(String(b)))).toEqual([
      '/bin/free',
      '/bin/run',
    ]);
  });

  test('a plugin-only lock set by the update drops the project agent hooks, not the plugin ones', async () => {
    const { host, session, runner } = await setup();
    session.addHooks('agent:project', bashGuard('/bin/project'), { ...AGENT, scope: 'project' });
    session.addHooks(
      'agent:plugin',
      bashGuard('/bin/plugin'),
      { ...AGENT, pluginName: 'guarded' },
      {
        pluginId: GUARDED,
      },
    );
    host.update({
      settings: createPolicyView([
        layerOf('managed', { strictPluginOnlyCustomization: ['hooks'] }),
      ]),
    });
    settle(session);
    host.update({ settings: createPolicyView([]) });
    await session.dispatch('PreToolUse', BASH, { signal: signal() });
    expect(commandsRun(runner)).toEqual(['/bin/plugin']);
  });
});

const warned = (expansion: { issues?: readonly unknown[] }) => (expansion.issues ?? []).length > 0;

describe('the limits on skill hooks over an update', () => {
  test('a kept plugin keeps what its skills used: the next big skill is still refused', async () => {
    const { host, session } = await setup();
    expect(warned(await expand(session, 'guarded:big1'))).toBe(false);
    host.update({ plugins: [hostPlugin(GUARDED, await guarded())] });
    expect(warned(await expand(session, 'guarded:big2'))).toBe(true);
  });

  test('a plugin that was dropped and added again starts from zero: both counters follow the survivors', async () => {
    const { host, session } = await setup();
    await expand(session, 'guarded:big1');
    host.update(without(GUARDED));
    settle(session);
    host.update({ settings: createPolicyView([]) });
    expect(warned(await expand(session, 'guarded:big2'))).toBe(false);
    expect(warned(await expand(session, 'guarded:big1'))).toBe(true);
    expect(session.hasHooks('PreToolUse')).toBe(true);
  });

  test('invoking a skill again after an update still counts its hooks once', async () => {
    const { host, session } = await setup();
    await expand(session, 'guarded:big1');
    host.update({ plugins: [hostPlugin(GUARDED, await guarded())] });
    expect(warned(await expand(session, 'guarded:big1'))).toBe(false);
  });
});

describe('the watch list over an update', () => {
  const paths = {
    stdout: JSON.stringify({
      hookSpecificOutput: { hookEventName: 'CwdChanged', watchPaths: ['/work/app/dyn'] },
    }),
  };

  test('the dynamic paths are kept, and the static names follow the new plugins', async () => {
    const watcher = await pluginOf('watcher', {
      hooks: {
        FileChanged: [{ matcher: '.envrc', hooks: [{ type: 'command', command: './on-env.sh' }] }],
        CwdChanged: [{ hooks: [{ type: 'command', command: './on-cd.sh' }] }],
      } satisfies HooksSettings,
    });
    const { host, session } = await (async () => {
      const fixture = await hostOf({
        plugins: [hostPlugin('watcher@acme', watcher)],
        runs: [paths],
      });
      return { ...fixture, session: fixture.host.openSession(SESSION) };
    })();
    await session.dispatch('CwdChanged', { old_cwd: '/a', new_cwd: '/b' }, { signal: signal() });
    expect(session.fileChangedWatchList()).toEqual(['.envrc', '/work/app/dyn']);
    host.update({ plugins: [hostPlugin(OTHER, await pluginOf('other'))] });
    expect(session.fileChangedWatchList()).toEqual(['/work/app/dyn']);
  });
});
