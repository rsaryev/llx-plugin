/**
 * The fields of a session a turn may not change, or changes for its own use (docs/API.md, "Host
 * and sessions", "Turns"; hooks.md, "Workspace trust" for `trusted`, "Common input fields" for
 * `scratchpad_dir`; skills.md, "Run skills in a subagent" for the `-p` and SDK case in which a
 * forked skill waits). Integration tests of the host, outside `spec()`.
 */
import { describe, expect, test } from 'bun:test';
import type { PluginSession } from '../../src/host/index.ts';
import { createPolicyView } from '../../src/settings/index.ts';
import { hostOf, loaded, SESSION, signal } from '../support/host.ts';
import { layerOf } from '../support/settings-layers.ts';

const write = {
  tool_name: 'Write',
  tool_input: { file_path: '/work/app/a.ts' },
  tool_use_id: 't1',
};

const stdinOf = (calls: readonly { readonly stdin?: string }[], at: number) =>
  JSON.parse(calls[at]?.stdin ?? '{}');

/** A hook in a settings file: held back until the workspace is trusted (hooks.md, "Workspace trust"). */
const settings = createPolicyView([
  layerOf('project', {
    hooks: {
      PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: './lint.sh' }] }],
    },
  }),
]);

/** A turn carrying a key `TurnOptions` does not have, as a host written in plain JavaScript could pass. */
const foreign = (fields: Record<string, unknown>): Record<string, unknown> => fields;

const settingsHost = () => hostOf({ plugins: [], settings, runs: [{}, {}] });

describe('trusted belongs to the session', () => {
  test('a turn that says `trusted: false` does not hold back the settings hooks of a trusted session', async () => {
    const { host, runner } = await settingsHost();
    const session = host.openSession(SESSION);
    await session
      .withTurn(foreign({ trusted: false }))
      .dispatch('PreToolUse', write, { signal: signal() });
    expect(runner.calls).toHaveLength(1);
  });

  test('a turn that says `trusted: true` does not release the settings hooks of an untrusted session', async () => {
    const { host, runner } = await settingsHost();
    const session = host.openSession({ ...SESSION, trusted: false });
    await session
      .withTurn(foreign({ trusted: true }))
      .dispatch('PreToolUse', write, { signal: signal() });
    await session.dispatch('PreToolUse', write, { signal: signal() });
    expect(runner.calls).toHaveLength(0);
  });
});

describe('scratchpadDir of a turn', () => {
  test('replaces the session one in the hook input, and the session keeps its own', async () => {
    const { host, runner } = await hostOf({ runs: [{}, {}] });
    const session = host.openSession({ ...SESSION, scratchpadDir: '/tmp/scratch-1' });
    await session
      .withTurn({ scratchpadDir: '/tmp/scratch-2' })
      .dispatch('PreToolUse', write, { signal: signal() });
    await session.dispatch('PreToolUse', write, { signal: signal() });
    expect(stdinOf(runner.calls, 0)).toMatchObject({ scratchpad_dir: '/tmp/scratch-2' });
    expect(stdinOf(runner.calls, 1)).toMatchObject({ scratchpad_dir: '/tmp/scratch-1' });
  });
});

async function forking() {
  const plugin = await loaded({
    '.claude-plugin/plugin.json': JSON.stringify({ name: 'forking' }),
    'skills/research/SKILL.md':
      '---\ndescription: Research a topic\ncontext: fork\n---\nResearch it.',
  });
  return hostOf({ plugins: [{ id: 'forking@acme', plugin }] });
}
const expansionOf = (session: PluginSession) =>
  session.expandSkill('forking:research', { signal: signal() });

describe('interactive of a turn', () => {
  test('a `-p` turn makes a forked skill wait, and the session itself is unchanged', async () => {
    const { host } = await forking();
    const session = host.openSession(SESSION);
    expect(await expansionOf(session.withTurn({ interactive: false }))).toMatchObject({
      execution: { mode: 'fork', background: false, waitsFor: ['non-interactive'] },
    });
    expect(await expansionOf(session)).toMatchObject({
      execution: { mode: 'fork', background: true },
    });
  });

  test('an interactive turn over a `-p` session runs it in the background', async () => {
    const { host } = await forking();
    const session = host.openSession({ ...SESSION, interactive: false });
    expect(await expansionOf(session.withTurn({ interactive: true }))).toMatchObject({
      execution: { mode: 'fork', background: true },
    });
    expect(await expansionOf(session)).toMatchObject({
      execution: { mode: 'fork', background: false },
    });
  });
});
