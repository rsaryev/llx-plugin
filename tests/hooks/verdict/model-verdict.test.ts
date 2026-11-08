/**
 * A prompt or agent hook's `ok: false` as a verdict: hooks.md § "Response schema" (the per-event
 * bullets) and § "Agent hook configuration". The table of what each event does is
 * `remote/ok-false.ts` (tested there); here its answer becomes a block, a stop, or feedback.
 * No id names this, so the tests sit outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import type { RawRun } from '../../../src/hooks/handlers/index.ts';
import type { HookHandler } from '../../../src/protocol/hook-config.ts';
import { verdictOf } from '../../support/hooks-verdict.ts';

const no: RawRun = { kind: 'model', ok: false, reason: 'tests fail' };
const prompt = (more: object = {}): HookHandler => ({ type: 'prompt', prompt: 'check', ...more });
const agent: HookHandler = { type: 'agent', prompt: 'check' };

describe('ok: false', () => {
  test('ok: true does nothing', () => {
    const verdict = verdictOf('Stop', { kind: 'model', ok: true }, { hook: prompt() });
    expect(verdict.status).toBe('success');
    expect(verdict.block).toBeUndefined();
  });

  test('Stop: the reason is fed back to Claude and the turn continues; impossible lets it end', () => {
    const verdict = verdictOf('Stop', no, { hook: prompt() });
    expect(verdict.block?.reason).toBe('tests fail');
    expect(verdict.stop).toBeUndefined();
    const impossible = verdictOf('Stop', { ...no, impossible: true }, { hook: prompt() });
    expect(impossible.block).toBeUndefined();
    // "Agent hooks and other events ignore it."
    expect(verdictOf('Stop', { ...no, impossible: true }, { hook: agent }).block).toBeDefined();
  });

  test('PreToolUse: the call is denied; by default the turn ends, with continueOnBlock it goes on', () => {
    const ends = verdictOf('PreToolUse', no, { hook: prompt() });
    expect(ends.block).toBeDefined();
    expect(ends.stop?.reason).toBe('tests fail');
    const goes = verdictOf('PreToolUse', no, { hook: prompt({ continueOnBlock: true }) });
    expect(goes.block).toBeDefined();
    expect(goes.stop).toBeUndefined();
    // An agent hook behaves as if continueOnBlock were true.
    expect(verdictOf('PreToolUse', no, { hook: agent }).stop).toBeUndefined();
  });

  test('PostToolUse: the turn ends, or the reason is fed back to Claude; the tool already ran', () => {
    const ends = verdictOf('PostToolUse', no, { hook: prompt() });
    expect(ends.stop?.reason).toBe('tests fail');
    expect(ends.block).toBeUndefined();
    const goes = verdictOf('PostToolUse', no, { hook: prompt({ continueOnBlock: true }) });
    expect(goes.feedback).toMatchObject({ to: 'claude' });
  });

  test('UserPromptSubmit: the prompt is blocked and the turn ends', () => {
    const verdict = verdictOf('UserPromptSubmit', no, { hook: prompt() });
    expect(verdict.block).toBeDefined();
    expect(verdict.stop?.reason).toBe('tests fail');
  });

  test('PostToolUseFailure: the reason goes to Claude as a tool error and the turn continues', () => {
    const verdict = verdictOf('PostToolUseFailure', no, { hook: prompt() });
    expect(verdict.feedback).toMatchObject({ to: 'claude' });
    expect(verdict.stop).toBeUndefined();
  });

  test('TeammateIdle: by default the teammate stops, which is not a block', () => {
    const stops = verdictOf('TeammateIdle', no, { hook: prompt() });
    expect(stops.stop?.reason).toBe('tests fail');
    expect(stops.block).toBeUndefined();
    const works = verdictOf('TeammateIdle', no, { hook: prompt({ continueOnBlock: true }) });
    expect(works.block).toBeDefined();
  });

  test('PermissionRequest: ok: false has no effect', () => {
    const verdict = verdictOf('PermissionRequest', no, { hook: prompt() });
    expect(verdict.block).toBeUndefined();
    expect(verdict.stop).toBeUndefined();
  });

  test('a model that did not answer is a non-blocking error', () => {
    const verdict = verdictOf(
      'Stop',
      { kind: 'model-failed', message: 'no JSON' },
      { hook: prompt() },
    );
    expect(verdict.status).toBe('non-blocking-error');
    expect(verdict.block).toBeUndefined();
  });
});
