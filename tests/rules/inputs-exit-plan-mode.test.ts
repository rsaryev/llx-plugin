/**
 * hooks.md § ExitPlanMode (PreToolUse input). "Claude writes the plan to a file on disk before calling
 * the tool, so the literal `tool_input` from the model is typically empty. Claude Code injects the
 * plan content and file path before passing the input to hooks." `plan` is Markdown, `planFilePath`
 * the path of the plan file, both "Injected". `allowedPrompts` is "Deprecated. Claude Code accepts the
 * field but ignores it."
 *
 * `plan` and `planFilePath` are doc-sourced, not SDK-sourced: the SDK's ExitPlanModeInput is
 * `allowedPrompts` plus an open index signature, so the compiler cannot tie these two names to it.
 * That the hook must pair "allow" with `updatedInput` for this tool is the hooks engine's rule, not
 * this module's.
 */
import { describe, expect, test } from 'bun:test';
import { effectiveExitPlanModeInput, parseToolInput } from '../../src/rules/index.ts';
import { spec } from '../support/spec.ts';

const paths = (raw: unknown): string[] =>
  parseToolInput('ExitPlanMode', raw).issues.map((found) => found.path);

spec('tools.input.ExitPlanMode.plan', () => {
  test('the injected plan is Markdown text', () => {
    const raw = { plan: '## Refactor auth\n1. Extract...' };
    const parse = parseToolInput('ExitPlanMode', raw);
    expect(parse.issues).toEqual([]);
    expect(parse.input).toEqual(raw);
  });

  test('a plan that is not text is refused at tool_input.plan', () => {
    expect(paths({ plan: ['1. Extract'] })).toEqual(['tool_input.plan']);
  });

  test('the literal input from the model is typically empty, and that is not an issue', () => {
    expect(parseToolInput('ExitPlanMode', {}).issues).toEqual([]);
  });
});

spec('tools.input.ExitPlanMode.planFilePath', () => {
  test('the injected path of the plan file is text', () => {
    const raw = { plan: '## Plan', planFilePath: '/Users/me/plans/refactor-auth.md' };
    const parse = parseToolInput('ExitPlanMode', raw);
    expect(parse.issues).toEqual([]);
    expect(parse.input).toEqual(raw);
  });

  test('a path that is not text is refused at tool_input.planFilePath', () => {
    expect(paths({ planFilePath: 7 })).toEqual(['tool_input.planFilePath']);
  });
});

spec('tools.input.ExitPlanMode.allowedPrompts', () => {
  const allowedPrompts = [{ tool: 'Bash', prompt: 'run tests' }];

  test('the deprecated field is accepted without an issue', () => {
    const parse = parseToolInput('ExitPlanMode', { plan: '## Plan', allowedPrompts });
    expect(parse.issues).toEqual([]);
    expect(parse.input.allowedPrompts).toEqual(allowedPrompts);
  });

  test('the effective input leaves it out and keeps everything else', () => {
    const raw = { plan: '## Plan', planFilePath: '/p.md', allowedPrompts, other: 1 };
    expect(effectiveExitPlanModeInput(raw)).toEqual({
      plan: '## Plan',
      planFilePath: '/p.md',
      other: 1,
    });
  });

  test('the effective input of a call without it is the call, and the raw input is untouched', () => {
    const raw = { plan: '## Plan', allowedPrompts };
    effectiveExitPlanModeInput(raw);
    expect(raw.allowedPrompts).toBe(allowedPrompts);
    expect(effectiveExitPlanModeInput({})).toEqual({});
  });
});

describe('allowedPrompts type (judgment, spec/judgments.md)', () => {
  test('the entries of the ignored field are not inspected', () => {
    expect(paths({ allowedPrompts: [{ tool: 'Edit', prompt: 1 }, 'anything'] })).toEqual([]);
  });

  test('it is a list, as in the SDK type: anything else is refused', () => {
    expect(paths({ allowedPrompts: 'run tests' })).toEqual(['tool_input.allowedPrompts']);
  });
});

describe('effectiveExitPlanModeInput where the input is not an object (judgment)', () => {
  test('anything that is not an object has no fields', () => {
    for (const raw of [undefined, null, 'plan', ['plan'], 3]) {
      expect(effectiveExitPlanModeInput(raw)).toEqual({});
    }
  });
});
