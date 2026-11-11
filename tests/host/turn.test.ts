/**
 * Turns over one session (docs/API.md, "Host and sessions", "Turns"; hooks.md, "Common input
 * fields" for `permission_mode`, `effort` and `cwd`; "Hooks in skills and agents" for a skill's
 * hooks that "keep running for the rest of the session, on turns after the skill's own turn", and
 * `once`; "Limits on skill hooks"; permissions.md, "Read and Edit" for path rules read from the
 * working directory): `withTurn` replaces the per-turn fields and shares everything that must
 * outlive a turn. Integration tests of the host, outside `spec()`: the docs describe a session in
 * Claude Code, not this API.
 */
import { describe, expect, test } from 'bun:test';
import type { PluginSession, TurnOptions } from '../../src/host/index.ts';
import { hostOf, loaded, SESSION, signal } from '../support/host.ts';

const json = (value: unknown): string => JSON.stringify(value);

const skill = (hooks: string, name: string): [string, string] => [
  `skills/${name}/SKILL.md`,
  `---\ndescription: ${name} operations\nhooks:\n${hooks}\n---\nRun ${name}.`,
];

const BASH_CHECK = [
  '  PreToolUse:',
  '    - matcher: "Bash"',
  '      hooks:',
  '        - { type: command, command: ./scripts/check.sh }',
].join('\n');

const ONCE = [
  '  PostToolUse:',
  '    - hooks:',
  '        - { type: command, command: ./scripts/once.sh, once: true }',
].join('\n');

const many = (count: number): string =>
  [
    '  PreToolUse:',
    '    - matcher: "Bash"',
    '      hooks:',
    ...Array.from({ length: count }, () => '        - { type: command, command: ./x.sh }'),
  ].join('\n');

/** `guarded`: a hook on edits under `./src`, one on every read, and skills that register hooks when invoked. */
async function guarded() {
  const plugin = await loaded({
    '.claude-plugin/plugin.json': json({ name: 'guarded' }),
    'hooks/hooks.json': json({
      hooks: {
        PreToolUse: [
          {
            matcher: 'Edit',
            hooks: [{ type: 'command', command: './src-guard.sh', if: 'Edit(./src/**)' }],
          },
          { matcher: 'Read', hooks: [{ type: 'command', command: './read-audit.sh' }] },
        ],
      },
    }),
    ...Object.fromEntries([
      skill(BASH_CHECK, 'secure'),
      skill(ONCE, 'audit'),
      skill(many(1000), 'big'),
      skill(many(20), 'next'),
      skill(many(25), 'late'),
    ]),
  });
  return hostOf({
    plugins: [{ id: 'guarded@acme', plugin }],
    runs: Array.from({ length: 12 }, () => ({})),
  });
}

const edit = (file_path: string) => ({
  tool_name: 'Edit',
  tool_input: { file_path, old_string: 'a', new_string: 'b' },
  tool_use_id: 't1',
});
const read = {
  tool_name: 'Read',
  tool_input: { file_path: '/work/app/src/a.ts' },
  tool_use_id: 't3',
};
const bash = { tool_name: 'Bash', tool_input: { command: 'ls' }, tool_use_id: 't2' };
const done = { ...bash, tool_response: {}, duration_ms: 1 };

const expand = (session: PluginSession, name: string) =>
  session.expandSkill(name, { signal: signal() });

const stdinOf = (calls: readonly { readonly stdin?: string }[], at: number) =>
  JSON.parse(calls[at]?.stdin ?? '{}');

describe('withTurn replaces the per-turn fields of the hook input', () => {
  test('permission_mode, effort and cwd are the turn, and the session keeps its own', async () => {
    const { host, runner } = await guarded();
    const session = host.openSession({ ...SESSION, effort: { level: 'low' } });
    const turn = session.withTurn({
      permissionMode: 'plan',
      effort: { level: 'max' },
      cwd: '/work/app/src',
    });
    await turn.dispatch('PreToolUse', read, { signal: signal() });
    await session.dispatch('PreToolUse', read, { signal: signal() });
    expect(stdinOf(runner.calls, 0)).toMatchObject({
      permission_mode: 'plan',
      effort: { level: 'max' },
      cwd: '/work/app/src',
    });
    expect(stdinOf(runner.calls, 1)).toMatchObject({
      permission_mode: 'default',
      effort: { level: 'low' },
      cwd: '/work/app',
    });
  });

  test('a field the turn does not name stays what the session had, and views build on views', async () => {
    const { host, runner } = await guarded();
    const session = host.openSession({ ...SESSION, effort: { level: 'high' } });
    const view = session
      .withTurn({ permissionMode: 'acceptEdits' })
      .withTurn({ cwd: '/work/app/src' });
    await view.dispatch('PreToolUse', read, { signal: signal() });
    expect(stdinOf(runner.calls, 0)).toMatchObject({
      permission_mode: 'acceptEdits',
      effort: { level: 'high' },
      cwd: '/work/app/src',
    });
  });

  test('TurnOptions takes a field given as undefined, as HostUpdate does, and ignores it', async () => {
    const { host, runner } = await guarded();
    const turn: TurnOptions = { permissionMode: undefined, cwd: undefined };
    await host
      .openSession(SESSION)
      .withTurn(turn)
      .dispatch('PreToolUse', read, { signal: signal() });
    expect(stdinOf(runner.calls, 0)).toMatchObject({
      permission_mode: 'default',
      cwd: '/work/app',
    });
  });

  test('a field given as undefined, and a field a turn may not change, are ignored', async () => {
    const { host, runner } = await guarded();
    const foreign: Record<string, unknown> = {
      permissionMode: undefined,
      sessionId: 'other',
      transcriptPath: '/elsewhere.jsonl',
    };
    const turn = host.openSession(SESSION).withTurn(foreign);
    await turn.dispatch('PreToolUse', read, { signal: signal() });
    expect(stdinOf(runner.calls, 0)).toMatchObject({
      session_id: 'sess-1',
      transcript_path: '/work/.claude/sess-1.jsonl',
      permission_mode: 'default',
    });
  });

  // `additionalDirectories` is not exercised here: an `if` path rule is anchored to the working
  // directory and never widened by additional ones (the rules' `inScope` is for permission
  // decisions, not for `if`), so a turn's additional directories cannot change what fires.
  test('an `if` path rule is read from the cwd of the turn', async () => {
    const { host, runner } = await guarded();
    const session = host.openSession(SESSION);
    const file = edit('/work/app/src/a.ts');
    await session.dispatch('PreToolUse', file, { signal: signal() });
    expect(runner.calls).toHaveLength(1);
    await session.withTurn({ cwd: '/work/other' }).dispatch('PreToolUse', file, {
      signal: signal(),
    });
    expect(runner.calls).toHaveLength(1);
    await session.withTurn({ cwd: '/work/app' }).dispatch('PreToolUse', file, {
      signal: signal(),
    });
    expect(runner.calls).toHaveLength(2);
  });
});

describe('what outlives a turn', () => {
  test("a skill's hook registered in one turn fires in the next, and in the session itself", async () => {
    const { host, runner } = await guarded();
    const session = host.openSession(SESSION);
    expect((await expand(session.withTurn({ permissionMode: 'plan' }), 'guarded:secure')).ok).toBe(
      true,
    );
    await session.dispatch('PreToolUse', bash, { signal: signal() });
    await session.withTurn({ effort: { level: 'low' } }).dispatch('PreToolUse', bash, {
      signal: signal(),
    });
    expect(runner.calls.map((run) => run.spec)).toEqual([
      expect.objectContaining({ command: './scripts/check.sh' }),
      expect.objectContaining({ command: './scripts/check.sh' }),
    ]);
  });

  test('a `once` hook consumed in one turn stays gone in the next', async () => {
    const { host, runner } = await guarded();
    const session = host.openSession(SESSION);
    await expand(session, 'guarded:audit');
    await session.withTurn({ permissionMode: 'plan' }).dispatch('PostToolUse', done, {
      signal: signal(),
    });
    expect(runner.calls).toHaveLength(1);
    await session.withTurn({ permissionMode: 'auto' }).dispatch('PostToolUse', done, {
      signal: signal(),
    });
    await session.dispatch('PostToolUse', done, { signal: signal() });
    expect(runner.calls).toHaveLength(1);
  });

  test('the limits on skill hooks add up across turns, and invoking a skill again counts it once', async () => {
    const { host } = await guarded();
    const session = host.openSession(SESSION);
    const run = (turn: number, name: string) =>
      expand(session.withTurn({ promptId: `p${turn}` }), `guarded:${name}`);
    expect((await run(1, 'big')).issues).toEqual([]);
    expect((await run(2, 'big')).issues).toEqual([]);
    expect((await run(3, 'next')).issues).toEqual([]);
    const past = await run(4, 'late');
    expect(past.issues.map((found) => found.message).join('\n')).toContain(
      'registers none of its hooks',
    );
  });

  test('another session of the host has none of it', async () => {
    const { host, runner } = await guarded();
    await expand(host.openSession(SESSION).withTurn({ cwd: '/work/app' }), 'guarded:secure');
    await host.openSession(SESSION).dispatch('PreToolUse', bash, { signal: signal() });
    expect(runner.calls).toHaveLength(0);
  });
});
