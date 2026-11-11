/**
 * hooks.md § "PreToolUse `ask` decisions in auto mode" (a hook's `ask` prompts and the classifier does
 * not decide it, except for calls Claude Code's own checks flag too, which the classifier can deny
 * before any prompt, and `SubagentHandback`, which no prompt guards) and § "PreToolUse `updatedInput`
 * in auto mode" (a change with no `permissionDecision` can be denied with the documented text; a
 * repeat of the changed input drops the change; a command hook may change six tools without the
 * denial in the sessions that show the text, unless an earlier call in the response changed or a
 * Bash command asks to leave the sandbox). Asserted through `decide`, `settleClassification` and
 * `reviewHookRewrite`. The review itself and the next response are the host's.
 */
import { describe, expect, test } from 'bun:test';
import { afterHandbackDenial } from '../../../src/agents/index.ts';
import {
  decide,
  reviewHookRewrite,
  settleClassification,
  type HookRewriteSession,
  type PermissionClassifier,
} from '../../../src/rules/index.ts';
import { allow, ask, baseContext, bash, decision, deny, onPath } from '../../support/decide.ts';
import { call } from '../../support/rule-context.ts';
import { spec } from '../../support/spec.ts';
import type { PermissionBehavior } from '../../../src/protocol/official.ts';
import { HANDBACK_DENIALS_TOLD } from '../../../src/agents/handback-denial.ts';
import { CHANGED_INPUT_DENIAL } from '../../../src/rules/decide/hook-rewrite.ts';

const hookAsk = { hook: { decision: 'ask' as const } };
const auto = { autoAvailable: true };

/** A classifier that answers `answer` and records whether it was asked. */
function reviewer(answer: PermissionBehavior): PermissionClassifier & { asked: number } {
  const state = { asked: 0 };
  return {
    review: () => {
      state.asked += 1;
      return Promise.resolve(answer);
    },
    get asked() {
      return state.asked;
    },
  };
}

spec('hooks.behavior.PreToolUse ask decisions in auto mode', () => {
  test('a hook "ask" sends an ordinary call to the permission prompt: the classifier does not decide it', () => {
    expect(bash('auto', 'git push origin main', { ...auto, ...hookAsk })).toEqual(ask('hook'));
    expect(onPath('auto', 'Write', '/work/app/src/a.ts', { ...auto, ...hookAsk })).toEqual(
      ask('hook'),
    );
  });

  test("without the hook the same call goes to the classifier, so the prompt is the hook's doing", () => {
    expect(bash('auto', 'git push origin main', auto)).toEqual({
      outcome: 'classify',
      reason: 'mode-auto',
    });
  });

  test('a write to a protected path is one Claude Code flags too: the classifier reviews it before any prompt', () => {
    const outcome = onPath('auto', 'Write', '/work/app/.git/config', { ...auto, ...hookAsk });
    expect(outcome).toMatchObject({ outcome: 'classify', reason: 'hook' });
  });

  test('a command that asks to run outside the sandbox is reviewed first too', () => {
    const outcome = decision(
      'auto',
      'Bash',
      { command: 'npm install', dangerouslyDisableSandbox: true },
      { ...auto, ...hookAsk },
    );
    expect(outcome).toMatchObject({ outcome: 'classify', reason: 'hook' });
  });

  test('the classifier can deny such a call before any prompt appears', async () => {
    const classifier = reviewer('deny');
    const first = onPath('auto', 'Write', '/work/app/.git/config', { ...auto, ...hookAsk });
    const settled = await settleClassification(first, {
      call: call('Write', { file_path: '/work/app/.git/config' }),
      mode: 'auto',
      classifier,
    });
    expect(settled).toEqual(deny('hook'));
    expect(classifier.asked).toBe(1);
  });

  test('if the classifier approves, the call still goes to the prompt', async () => {
    const first = onPath('auto', 'Write', '/work/app/.git/config', { ...auto, ...hookAsk });
    const settled = await settleClassification(first, {
      call: call('Write', { file_path: '/work/app/.git/config' }),
      mode: 'auto',
      classifier: reviewer('allow'),
    });
    expect(settled).toEqual(ask('hook'));
  });

  test('a plain hook ask never reaches the classifier when it is settled', async () => {
    const classifier = reviewer('deny');
    const first = bash('auto', 'git push', { ...auto, ...hookAsk });
    const settled = await settleClassification(first, {
      call: call('Bash', { command: 'git push' }),
      mode: 'auto',
      classifier,
    });
    expect(settled).toEqual(ask('hook'));
    expect(classifier.asked).toBe(0);
  });

  test('a SubagentHandback call has no prompt and runs even if the classifier objects', async () => {
    const outcome = decide(call('SubagentHandback', { report: 'done' }), {
      ...baseContext('auto', auto),
      ...hookAsk,
    });
    expect(outcome).toEqual(allow('no-permission-required'));
    const settled = await settleClassification(outcome, {
      call: call('SubagentHandback', { report: 'done' }),
      mode: 'auto',
      classifier: reviewer('deny'),
    });
    expect(settled.outcome).toBe('allow');
  });

  test('to stop a SubagentHandback call the hook returns "deny"', () => {
    const outcome = decide(call('SubagentHandback', { report: 'done' }), {
      ...baseContext('auto', auto),
      hook: { decision: 'deny' },
    });
    expect(outcome).toEqual(deny('hook'));
  });

  test('after a denial Claude Code tells the subagent up to three times, then the subagent ends without a report', () => {
    expect(HANDBACK_DENIALS_TOLD).toBe(3);
    expect([1, 2, 3].map(afterHandbackDenial)).toEqual([
      'tell-subagent',
      'tell-subagent',
      'tell-subagent',
    ]);
    expect(afterHandbackDenial(4)).toBe('end-without-report');
  });
});

spec('hooks.behavior.PreToolUse updatedInput in auto mode', () => {
  const live: HookRewriteSession = {
    mode: 'auto',
    showsDenialText: true,
    commandHook: true,
    earlierChangeInResponse: false,
  };
  const rewrite = (toolName: string, session: Partial<HookRewriteSession> = {}) =>
    reviewHookRewrite(
      { toolName, input: { x: 1 }, updatedInput: { x: 2 } },
      { ...live, ...session },
    );

  test('the denial carries the documented text', () => {
    expect(CHANGED_INPUT_DENIAL).toBe(
      "a hook changed this call's input after auto mode reviewed it",
    );
    expect(rewrite('WebFetch')).toEqual({ kind: 'deny', text: CHANGED_INPUT_DENIAL });
  });

  test("a change with a permissionDecision is not this denial: the decision is the hook's", () => {
    for (const decisionValue of ['allow', 'ask'] as const) {
      expect(
        reviewHookRewrite(
          {
            toolName: 'WebFetch',
            input: { x: 1 },
            updatedInput: { x: 2 },
            decision: decisionValue,
          },
          live,
        ),
      ).toEqual({ kind: 'apply' });
    }
  });

  test('outside auto mode there is no review to contradict, so the change applies', () => {
    expect(rewrite('WebFetch', { mode: 'default' })).toEqual({ kind: 'apply' });
  });

  test('a hook that returns no updatedInput changes nothing to deny', () => {
    expect(
      reviewHookRewrite({ toolName: 'WebFetch', input: { x: 1 }, updatedInput: undefined }, live),
    ).toEqual({ kind: 'apply' });
  });

  test('after the denial Claude can issue the changed call again; repeated exactly, the change is dropped', () => {
    const repeated = reviewHookRewrite(
      { toolName: 'WebFetch', input: { b: 2, a: 1 }, updatedInput: { a: 9 } },
      { ...live, deniedChange: { a: 1, b: 2 } },
    );
    expect(repeated).toEqual({ kind: 'drop' });
  });

  test('a repeat with any difference is a new change and is reviewed again', () => {
    const different = reviewHookRewrite(
      { toolName: 'WebFetch', input: { a: 1, b: 3 }, updatedInput: { a: 9 } },
      { ...live, deniedChange: { a: 1, b: 2 } },
    );
    expect(different).toEqual({ kind: 'deny', text: CHANGED_INPUT_DENIAL });
  });

  test('the hook still runs on the repeat and can deny it or send it to the prompt: the drop concerns updatedInput only', () => {
    // The verdict says only what becomes of the change; a hook's own decision is read by `decide`.
    expect(
      decision(
        'auto',
        'WebFetch',
        { url: 'https://example.com' },
        { ...auto, hook: { decision: 'deny' } },
      ),
    ).toEqual(deny('hook'));
    expect(
      decision(
        'auto',
        'WebFetch',
        { url: 'https://example.com' },
        { ...auto, hook: { decision: 'ask' } },
      ),
    ).toEqual(ask('hook'));
  });

  test('a command hook in settings or a plugin changes Bash, PowerShell, Monitor, Edit, Write and NotebookEdit without the denial', () => {
    for (const tool of ['Bash', 'PowerShell', 'Monitor', 'Edit', 'Write', 'NotebookEdit']) {
      expect(rewrite(tool)).toEqual({ kind: 'apply' });
    }
  });

  test('that holds for a command hook only: an HTTP, prompt or other hook changing the same call is denied', () => {
    expect(rewrite('Bash', { commandHook: false })).toEqual({
      kind: 'deny',
      text: CHANGED_INPUT_DENIAL,
    });
  });

  test('the denial can still appear when any hook changed an earlier call in the same Claude response', () => {
    expect(rewrite('Bash', { earlierChangeInResponse: true })).toEqual({
      kind: 'deny',
      text: CHANGED_INPUT_DENIAL,
    });
  });

  test('or when a Bash command asks to run outside the sandbox', () => {
    const outcome = reviewHookRewrite(
      {
        toolName: 'Bash',
        input: { command: 'npm install', dangerouslyDisableSandbox: true },
        updatedInput: { command: 'npm ci', dangerouslyDisableSandbox: true },
      },
      live,
    );
    expect(outcome).toEqual({ kind: 'deny', text: CHANGED_INPUT_DENIAL });
  });
});

describe('judgments', () => {
  test('a session that does not show the text still denies an unreviewed change, without the text', () => {
    const outcome = reviewHookRewrite(
      { toolName: 'Bash', input: { command: 'a' }, updatedInput: { command: 'b' } },
      {
        mode: 'auto',
        showsDenialText: false,
        commandHook: true,
        earlierChangeInResponse: false,
      },
    );
    expect(outcome).toEqual({ kind: 'deny' });
  });

  test('a hook ask keeps its outcome in default and dontAsk modes', () => {
    expect(bash('dontAsk', 'git push', hookAsk)).toEqual(deny('hook'));
    expect(bash('default', 'git push', hookAsk)).toEqual(ask('hook'));
  });
});
