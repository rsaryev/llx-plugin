import { bodyOf } from '../support/expand.ts';
/**
 * What a skill's `!` command runs under when the host gives no answer of its own (skills.md,
 * "Permission checks on injected commands": "The commands are checked against your permission rules
 * the same way as any other Bash call ... Deny and ask rules still override `allowed-tools`"; "Inject
 * dynamic context"). The default answer is `decide` over the session's rules with the skill's
 * `allowed-tools` as allow rules; a command runs with the environment of a Bash subprocess
 * (env-vars.md). Oracle 2.1.322 (spec/judgments.md): an injected command sees
 * `CLAUDE_CODE_SESSION_ID`, `CLAUDECODE` and the settings `env`. Integration tests, outside `spec()`.
 */
import { describe, expect, test } from 'bun:test';
import { parseRule, type PermissionRule } from '../../src/rules/index.ts';
import { createPolicyView } from '../../src/settings/index.ts';
import { layerOf } from '../support/settings-layers.ts';
import { hostOf, loaded, SESSION, signal } from '../support/host.ts';

const json = (value: unknown): string => JSON.stringify(value);

async function shellHost(allowed: string, settings?: unknown) {
  const plugin = await loaded({
    '.claude-plugin/plugin.json': json({ name: 'ops' }),
    'skills/branch/SKILL.md': `---\ndescription: Show the branch\nallowed-tools: ${allowed}\n---\nBranch: !\`git rev-parse --abbrev-ref HEAD\``,
  });
  return hostOf({
    plugins: [{ id: 'ops@acme', plugin }],
    runs: [{ stdout: 'main\n' }],
    ...(settings === undefined ? {} : { settings: createPolicyView([layerOf('user', settings)]) }),
  });
}

const rule = (text: string, behavior: 'allow' | 'deny' | 'ask'): PermissionRule => {
  const read = parseRule(text, { behavior, source: { kind: 'user' } });
  if (read.rule === undefined) throw new Error(`not a rule: ${text}`);
  return read.rule;
};

const expand = async (allowed: string, rules: readonly PermissionRule[] = []) => {
  const { host, runner } = await shellHost(allowed);
  const session = host.openSession({ ...SESSION, permissionRules: rules });
  return { expansion: await session.expandSkill('ops:branch', { signal: signal() }), runner };
};

describe('the default answer to an injected command', () => {
  test('the skill`s allowed-tools grant lets it run', async () => {
    const { expansion, runner } = await expand('Bash(git rev-parse *)');
    expect(expansion.ok && bodyOf(expansion.text)).toBe('Branch: main');
    expect(runner.calls).toHaveLength(1);
  });

  test('a deny rule of the session overrides the grant', async () => {
    const { expansion, runner } = await expand('Bash(git rev-parse *)', [
      rule('Bash(git *)', 'deny'),
    ]);
    expect(expansion.ok).toBe(false);
    expect(runner.calls).toHaveLength(0);
  });

  test('an ask rule of the session overrides the grant, and an ask aborts', async () => {
    const { expansion, runner } = await expand('Bash(git rev-parse *)', [
      rule('Bash(git rev-parse *)', 'ask'),
    ]);
    expect(expansion.ok).toBe(false);
    expect(runner.calls).toHaveLength(0);
  });

  test('an allow rule of the session lets it run without a grant', async () => {
    const { expansion } = await expand('Read', [rule('Bash(git rev-parse *)', 'allow')]);
    expect(expansion.ok).toBe(true);
  });

  test('the host`s own answer replaces the default', async () => {
    const { host, runner } = await shellHost('Bash(git rev-parse *)');
    const session = host.openSession({ ...SESSION, shellPermission: () => 'deny' });
    expect((await session.expandSkill('ops:branch', { signal: signal() })).ok).toBe(false);
    expect(runner.calls).toHaveLength(0);
  });
});

describe('the environment of an injected command (oracle 2.1.322)', () => {
  test('it is a Bash subprocess`s: the session id, CLAUDECODE and the settings env', async () => {
    const { host, runner } = await shellHost('Bash(git rev-parse *)', {
      env: { MYVAR: 'from-settings' },
    });
    const expansion = await host
      .openSession(SESSION)
      .expandSkill('ops:branch', { signal: signal() });
    expect(expansion.ok).toBe(true);
    expect(runner.calls[0]?.env).toMatchObject({
      CLAUDECODE: '1',
      CLAUDE_CODE_CHILD_SESSION: '1',
      CLAUDE_CODE_SESSION_ID: 'sess-1',
      MYVAR: 'from-settings',
    });
  });
});
