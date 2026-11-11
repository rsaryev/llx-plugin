/**
 * Judgment (spec/judgments.md): a session of a host whose tools carry other names
 * (`SessionOptions.toolNames`) reads every tool name in Claude Code's terms: a hook `matcher` and
 * `if` rule and the `tool_name` of the hook input see the Claude Code name, and the permission rules
 * match it. The input shapes stay the host's to map.
 */
import { describe, expect, test } from 'bun:test';
import { baseContext, rulesOf } from '../support/decide.ts';
import { hostOf, SESSION, signal } from '../support/host.ts';

const TOOL_NAMES = { toClaude: { write_file: 'Write', shell: 'Bash' } };

async function check(toolName: string, reply: object, rules = rulesOf()) {
  const { host, runner } = await hostOf({ runs: [reply] });
  const session = host.openSession({ ...SESSION, toolNames: TOOL_NAMES });
  const result = await session.checkTool(
    { toolName, input: { file_path: '/work/app/a.ts', content: 'x' } },
    { toolUseId: 't1', permissionContext: baseContext('default', { rules }), signal: signal() },
  );
  return { result, runner, session };
}

describe('the host tool names in a session (judgment, spec/judgments.md)', () => {
  test('a Write|Edit matcher runs for the host tool that is Write, and its input names Write', async () => {
    const { result, runner } = await check('write_file', { exitCode: 2, stderr: 'no writes' });
    expect(result.hook.proceed).toBe(false);
    expect(JSON.parse(runner.calls[0]?.stdin ?? '{}').tool_name).toBe('Write');
  });

  test('a permission rule on Write decides the host tool that is Write', async () => {
    const { result } = await check('write_file', {}, rulesOf(['allow', 'Write']));
    expect(result.decision.outcome).toBe('allow');
  });

  test('a dispatch of a tool event reads the host name as the Claude Code name', async () => {
    const { host, runner } = await hostOf({ runs: [{}] });
    const session = host.openSession({ ...SESSION, toolNames: TOOL_NAMES });
    const facts = { tool_name: 'write_file', tool_input: { file_path: '/work/app/b.ts' } };
    await session.dispatch('PreToolUse', { ...facts, tool_use_id: 't2' }, { signal: signal() });
    expect(JSON.parse(runner.calls[0]?.stdin ?? '{}').tool_name).toBe('Write');
  });
});

describe('a host tool whose Claude Code name depends on the call (judgment, spec/judgments.md)', () => {
  const FILES = {
    toClaude: { files: ['Read', 'Write'] },
    callName: (_tool: string, input: unknown) =>
      typeof input === 'object' && input !== null && 'content' in input ? 'Write' : 'Read',
  };
  async function call(input: object, rules = rulesOf()) {
    const { host, runner } = await hostOf({ runs: [{ exitCode: 2, stderr: 'no writes' }] });
    const session = host.openSession({ ...SESSION, toolNames: FILES });
    const result = await session.checkTool(
      { toolName: 'files', input },
      { toolUseId: 't1', permissionContext: baseContext('default', { rules }), signal: signal() },
    );
    return { result, runner };
  }

  test('a writing call is Write to a Write|Edit matcher and its input', async () => {
    const { result, runner } = await call({ file_path: '/work/app/a.ts', content: 'x' });
    expect(result.hook.proceed).toBe(false);
    expect(JSON.parse(runner.calls[0]?.stdin ?? '{}').tool_name).toBe('Write');
  });

  test('a reading call is Read: the Write|Edit matcher skips it and a Read rule decides it', async () => {
    const { result, runner } = await call(
      { file_path: '/work/app/a.ts' },
      rulesOf(['deny', 'Read']),
    );
    expect(runner.calls).toEqual([]);
    expect(result.decision.outcome).toBe('deny');
  });

  test('a rule on one name does not decide the call carrying the other', async () => {
    const { result } = await call({ file_path: '/work/app/a.ts' }, rulesOf(['deny', 'Write']));
    expect(result.decision.outcome).not.toBe('deny');
  });

  test('a dispatched event names the call as its input makes it', async () => {
    const { host, runner } = await hostOf({ runs: [{}] });
    const session = host.openSession({ ...SESSION, toolNames: FILES });
    const facts = { tool_name: 'files', tool_input: { file_path: '/work/app/b.ts', content: 'y' } };
    await session.dispatch('PreToolUse', { ...facts, tool_use_id: 't2' }, { signal: signal() });
    expect(JSON.parse(runner.calls[0]?.stdin ?? '{}').tool_name).toBe('Write');
  });
});
