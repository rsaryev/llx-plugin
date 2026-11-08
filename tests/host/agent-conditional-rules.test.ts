/** sub-agents.md § Conditional rules with hooks: a PreToolUse guard sees SQL and can block writes. */
import { expect, test } from 'bun:test';
import { z } from 'zod';
import { readAgent } from '../../src/format/agent.ts';
import { hostOf, SESSION, signal } from '../support/host.ts';
import { spec } from '../support/spec.ts';

spec('agents.behavior.Conditional rules with hooks', () => {
  test('a non-plugin database agent can allow read-only commands and block mutations before they run', async () => {
    const agent = readAgent(
      [
        '---',
        'name: db',
        'description: Read-only database access',
        'tools: Bash',
        'hooks:',
        '  PreToolUse:',
        '    - matcher: Bash',
        '      hooks:',
        '        - type: command',
        '          command: python validate_sql.py',
        '---',
        'Run read-only queries.',
      ].join('\n'),
      { source: 'project', path: 'agents/db.md' },
    ).agent;
    if (agent?.hooks === undefined) throw new Error('the documented hooks did not load');
    const { host, runner } = await hostOf({
      plugins: [],
      runs: [{}, { exitCode: 2, stderr: 'Mutating statements are not permitted' }],
    });
    const session = host.openSession(SESSION);
    const hooks = agent.hooks;
    await session.runScoped({}, async (view) => {
      view.addHooks('db', hooks, { kind: 'agent', label: 'db' }, { lifetime: 'turn' });
      const allowed = await view.dispatch(
        'PreToolUse',
        { tool_name: 'Bash', tool_use_id: 'read', tool_input: { command: 'SELECT * FROM users' } },
        { signal: signal() },
      );
      const blocked = await view.dispatch(
        'PreToolUse',
        { tool_name: 'Bash', tool_use_id: 'write', tool_input: { command: 'DELETE FROM users' } },
        { signal: signal() },
      );
      expect(allowed.proceed).toBe(true);
      expect(blocked.proceed).toBe(false);
    });
    const input = z.object({ tool_input: z.object({ command: z.string() }) });
    expect(
      runner.calls.map((call) => input.parse(JSON.parse(call.stdin ?? '')).tool_input.command),
    ).toEqual(['SELECT * FROM users', 'DELETE FROM users']);
  });
});
