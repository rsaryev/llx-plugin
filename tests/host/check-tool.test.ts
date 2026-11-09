/**
 * `session.checkTool` (hooks.md, "PreToolUse decision control": `updatedInput` "Replaces the entire
 * input object ... Claude Code evaluates permission rules ... against the input your hook returns, not
 * the input Claude sent"; "A hook that exits with code 2 stops the tool call before permission rules
 * are evaluated"): the PreToolUse hooks of the plugins, then `decide` over the input they leave.
 */
import { describe, expect, test } from 'bun:test';
import { baseContext, rulesOf } from '../support/decide.ts';
import { hostOf, SESSION, signal } from '../support/host.ts';
import { spec } from '../support/spec.ts';

const allowWith = (updatedInput: object) => ({
  stdout: JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput },
  }),
});

const write = (file_path: string) => ({ toolName: 'Write', input: { file_path, content: 'x' } });

async function check(reply: object, permissions = baseContext('default')) {
  const { host } = await hostOf({ runs: [reply] });
  return host
    .openSession(SESSION)
    .checkTool(write('/work/app/a.ts'), { toolUseId: 't1', permissions, signal: signal() });
}

spec('hooks.output.PreToolUse.updatedInput', () => {
  test('the decision is over the input the hook returns, and that input is what runs', async () => {
    const permissions = baseContext('default', {
      rules: rulesOf(['deny', 'Edit(//work/app/locked.ts)']),
    });
    const changed = { file_path: '/work/app/locked.ts', content: 'x' };
    const result = await check(allowWith(changed), permissions);
    expect(result.input).toEqual(changed);
    expect(result.decision.outcome).toBe('deny');
  });

  test('a hook allow over an input no rule denies skips the prompt', async () => {
    const changed = { file_path: '/work/app/b.ts', content: 'y' };
    const result = await check(allowWith(changed));
    expect(result.input).toEqual(changed);
    expect(result.decision.outcome).toBe('allow');
  });
});

describe('judgments: checkTool without a hook answer', () => {
  test('a hook that says nothing leaves the input and the rules as they are', async () => {
    const result = await check({});
    expect(result.input).toEqual(write('/work/app/a.ts').input);
    expect(result.decision.outcome).toBe('ask');
  });

  test('a hook that exits 2 stops the call, whatever the rules allow', async () => {
    const permissions = baseContext('default', { rules: rulesOf(['allow', 'Write']) });
    const result = await check({ exitCode: 2, stderr: 'no writes' }, permissions);
    expect(result.hook.proceed).toBe(false);
    expect(result.decision.outcome).toBe('deny');
  });
});
