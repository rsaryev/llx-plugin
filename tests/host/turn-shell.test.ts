/**
 * The shell answer, working directory and effort of a turn (skills.md, "Inject dynamic context":
 * commands run in the working directory; "Permission checks on injected commands": a command is
 * checked against the permission rules like any Bash call, and an `ask` aborts the expansion;
 * "Available string substitutions": `${CLAUDE_EFFORT}`). `ShellPermission` is the host's answer
 * and changes with the turn. Integration tests of the host, outside `spec()`.
 */
import { describe, expect, test } from 'bun:test';
import type { PluginSession } from '../../src/host/index.ts';
import type { ShellPermission } from '../../src/skills/index.ts';
import { hostOf, loaded, SESSION, signal } from '../support/host.ts';

const json = (value: unknown): string => JSON.stringify(value);

async function shellHost() {
  const plugin = await loaded({
    '.claude-plugin/plugin.json': json({ name: 'ops' }),
    'skills/branch/SKILL.md':
      '---\ndescription: Show the branch\n---\nEffort ${CLAUDE_EFFORT}. Branch: !`git rev-parse --abbrev-ref HEAD`',
  });
  return hostOf({
    plugins: [{ id: 'ops@acme', plugin }],
    runs: [{ stdout: 'main\n' }, { stdout: 'dev\n' }],
  });
}

const ASKS: ShellPermission = () => 'ask';

const expand = (session: PluginSession) => session.expandSkill('ops:branch', { signal: signal() });

describe('permissions per turn', () => {
  test('a placeholder asks in one turn, which aborts it, and is allowed in the next', async () => {
    const { host, runner } = await shellHost();
    const session = host.openSession(SESSION);
    const asked = await expand(session);
    expect(asked.ok).toBe(false);
    expect(runner.calls).toHaveLength(0);
    const allowed = await expand(session.withTurn({ permissions: () => 'allow' }));
    expect(allowed).toMatchObject({ ok: true, text: 'Effort ${CLAUDE_EFFORT}. Branch: main' });
    expect(runner.calls).toHaveLength(1);
  });

  test('allowed in one turn and asking in the next: the answer is not kept', async () => {
    const { host, runner } = await shellHost();
    const session = host.openSession({ ...SESSION, permissions: () => 'allow' });
    expect((await expand(session)).ok).toBe(true);
    expect((await expand(session.withTurn({ permissions: ASKS }))).ok).toBe(false);
    expect((await expand(session)).ok).toBe(true);
    expect(runner.calls).toHaveLength(2);
  });

  test('a deny of the turn also stops the command, and the answer sees the command and the tool', async () => {
    const { host, runner } = await shellHost();
    const seen: string[] = [];
    const denied = await expand(
      host.openSession(SESSION).withTurn({
        permissions: (call) => {
          seen.push(`${call.tool}: ${call.command}`);
          return 'deny';
        },
      }),
    );
    expect(denied.ok).toBe(false);
    expect(seen).toEqual(['Bash: git rev-parse --abbrev-ref HEAD']);
    expect(runner.calls).toHaveLength(0);
  });

  test('the cwd and effort of the turn are where the command runs and what ${CLAUDE_EFFORT} says', async () => {
    const { host, runner } = await shellHost();
    const session = host.openSession({
      ...SESSION,
      permissions: () => 'allow',
      effort: { level: 'low' },
    });
    const first = await expand(session);
    const second = await expand(
      session.withTurn({ cwd: '/work/other', effort: { level: 'high' } }),
    );
    expect(first).toMatchObject({ ok: true, text: 'Effort low. Branch: main' });
    expect(second).toMatchObject({ ok: true, text: 'Effort high. Branch: dev' });
    expect(runner.calls.map((run) => run.cwd)).toEqual(['/work/app', '/work/other']);
  });
});
