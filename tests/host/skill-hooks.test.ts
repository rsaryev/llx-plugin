/**
 * hooks.md § Hooks in skills and agents ("Skill hooks: Claude Code registers them when you or Claude
 * invoke the skill and keeps running them for the rest of the session, on turns after the skill's own
 * turn as well. ... set `once: true` on it" to remove it after its first successful run) and § Limits
 * on skill hooks (each source of skills registers at most 1,024 hooks and 16,384 matcher characters;
 * a skill past the limit "registers none of its hooks"). The skill's hooks join the session's registry
 * when the host expands the skill; integration tests of the host, outside `spec()` except the
 * ids the two `spec(...)` blocks below name.
 */
import { describe, expect, test } from 'bun:test';
import { hostOf, loaded, SESSION, signal } from '../support/host.ts';
import { spec } from '../support/spec.ts';

const json = (value: unknown): string => JSON.stringify(value);

const skill = (hooks: string, name = 'secure'): [string, string] => [
  `skills/${name}/SKILL.md`,
  `---\ndescription: ${name} operations\nhooks:\n${hooks}\n---\nRun ${name}.`,
];

const BASH_CHECK = [
  '  PreToolUse:',
  '    - matcher: "Bash"',
  '      hooks:',
  '        - type: command',
  '          command: ./scripts/check.sh',
].join('\n');

const ONCE = [
  '  PostToolUse:',
  '    - hooks:',
  '        - type: command',
  '          command: ./scripts/once.sh',
  '          once: true',
].join('\n');

async function guarded(files: Record<string, string> = {}) {
  const plugin = await loaded({
    '.claude-plugin/plugin.json': json({ name: 'guarded' }),
    ...Object.fromEntries([skill(BASH_CHECK), skill(ONCE, 'audit')]),
    ...files,
  });
  return hostOf({ plugins: [{ id: 'guarded@acme', plugin }], runs: [{}, {}, {}, {}] });
}

const bash = { tool_name: 'Bash', tool_input: { command: 'ls' }, tool_use_id: 't1' };
const read = { tool_name: 'Read', tool_input: { file_path: '/work/app/a.ts' }, tool_use_id: 't2' };
const done = { ...bash, tool_response: {}, duration_ms: 1 };

const expand = (
  session: ReturnType<Awaited<ReturnType<typeof guarded>>['host']['openSession']>,
  name: string,
) => session.expandSkill(name, { signal: signal() });

spec(
  ['hooks.behavior.Hook locations.Skill frontmatter', 'hooks.behavior.Hooks in skills and agents'],
  () => {
    test('before the skill is invoked nothing runs, afterwards its hook runs for a matching call', async () => {
      const { host, runner } = await guarded();
      const session = host.openSession(SESSION);
      await session.dispatch('PreToolUse', bash, { signal: signal() });
      expect(runner.calls).toHaveLength(0);
      expect((await expand(session, 'guarded:secure')).ok).toBe(true);
      await session.dispatch('PreToolUse', bash, { signal: signal() });
      expect(runner.calls).toHaveLength(1);
      expect(runner.calls[0]?.spec).toMatchObject({ command: './scripts/check.sh' });
    });

    test('it keeps running for the rest of the session, on every later turn', async () => {
      const { host, runner } = await guarded();
      const session = host.openSession(SESSION);
      await expand(session, 'guarded:secure');
      for (let turn = 0; turn < 3; turn += 1) {
        await session.dispatch('PreToolUse', bash, { signal: signal() });
      }
      expect(runner.calls).toHaveLength(3);
    });

    test("the hook's own matcher still applies: a Read call does not run a Bash hook", async () => {
      const { host, runner } = await guarded();
      const session = host.openSession(SESSION);
      await expand(session, 'guarded:secure');
      await session.dispatch('PreToolUse', read, { signal: signal() });
      expect(runner.calls).toHaveLength(0);
    });

    test('another session of the host does not have it', async () => {
      const { host, runner } = await guarded();
      await expand(host.openSession(SESSION), 'guarded:secure');
      await host.openSession({ ...SESSION, sessionId: 'sess-2' }).dispatch('PreToolUse', bash, {
        signal: signal(),
      });
      expect(runner.calls).toHaveLength(0);
    });

    test('invoking the skill again replaces its hooks: one run per call, not two', async () => {
      const { host, runner } = await guarded();
      const session = host.openSession(SESSION);
      await expand(session, 'guarded:secure');
      await expand(session, 'guarded:secure');
      await session.dispatch('PreToolUse', bash, { signal: signal() });
      expect(runner.calls).toHaveLength(1);
    });

    test('a skill without hooks registers nothing and expands as before', async () => {
      const { host, runner } = await hostOf({ runs: [{}] });
      const session = host.openSession(SESSION);
      expect((await expand(session, 'formatter:review')).ok).toBe(true);
      await session.dispatch('PreToolUse', bash, { signal: signal() });
      expect(runner.calls).toHaveLength(0);
    });
  },
);

describe('once: true', () => {
  test('a skill hook that ran successfully is removed: it runs for the first call only', async () => {
    const { host, runner } = await guarded();
    const session = host.openSession(SESSION);
    await expand(session, 'guarded:audit');
    await session.dispatch('PostToolUse', done, { signal: signal() });
    await session.dispatch('PostToolUse', done, { signal: signal() });
    expect(runner.calls.map((run) => run.spec.command)).toEqual(['./scripts/once.sh']);
  });
});

spec('hooks.behavior.Limits on skill hooks', () => {
  const many = (count: number): string =>
    [
      '  PreToolUse:',
      '    - matcher: "Bash"',
      '      hooks:',
      ...Array.from({ length: count }, () => '        - { type: command, command: ./x.sh }'),
    ].join('\n');

  test('a skill past 1,024 hooks for its source registers none of its hooks, and says so', async () => {
    const files = Object.fromEntries([skill(many(1025), 'huge')]);
    const { host, runner } = await guarded(files);
    const session = host.openSession(SESSION);
    const run = await expand(session, 'guarded:huge');
    expect(run.ok).toBe(true);
    expect(run.issues.map((found) => found.message).join('\n')).toContain(
      'registers none of its hooks',
    );
    await session.dispatch('PreToolUse', bash, { signal: signal() });
    expect(runner.calls).toHaveLength(0);
  });

  test('the totals build up skill by skill, and a later, smaller skill still fits', async () => {
    const files = Object.fromEntries([
      skill(many(1000), 'big'),
      skill(many(20), 'next'),
      skill(many(25), 'late'),
    ]);
    const { host } = await guarded(files);
    const session = host.openSession(SESSION);
    expect((await expand(session, 'guarded:big')).issues).toEqual([]);
    expect((await expand(session, 'guarded:next')).issues).toEqual([]);
    const past = await expand(session, 'guarded:late');
    expect(past.issues.map((found) => found.message).join('\n')).toContain(
      'registers none of its hooks',
    );
    expect((await expand(session, 'guarded:secure')).issues).toEqual([]);
  });

  test('the matcher characters count too: 16,384 at most', async () => {
    const wide = (matcher: string): string =>
      [
        '  PreToolUse:',
        `    - matcher: "${matcher}"`,
        '      hooks:',
        '        - { type: command, command: ./x.sh }',
      ].join('\n');
    const files = Object.fromEntries([skill(wide('a'.repeat(16_385)), 'wide')]);
    const { host } = await guarded(files);
    const run = await expand(host.openSession(SESSION), 'guarded:wide');
    expect(run.issues.map((found) => found.message).join('\n')).toContain(
      'registers none of its hooks',
    );
  });
});
