/**
 * Rewriting, adding to and dropping a prompt. plugins/mods/events.md § Rewrite or add to a prompt.
 * Where a prompt is typed and sent is the host's: the tests fire `prompt.submit` through the chain.
 */

import { describe, expect, test } from 'bun:test';
import { promptDroppedText } from '../../../src/mods/events/index.ts';
import { flush, fn, record } from '../../support/mods-chain.ts';
import { eventHarness, reasonsOf } from '../../support/mods-events.ts';
import { spec } from '../../support/spec.ts';

describe('rewrite or add to a prompt', () => {
  /** The hook of events.md: add the current branch for Claude when a prompt mentions a pull request. */
  const branchHook = () =>
    fn('prompt.submit', async ($, e, next) => {
      if (!/\bPR\b|pull request/i.test(String(e.text))) return next(e);
      const git = record(await $.process.run(['git', 'branch', '--show-current']));
      if (git.exitCode !== 0) return next(e);
      const context = Array.isArray(e.context) ? e.context : [];
      return next({ ...e, context: [...context, 'Current branch: ' + String(git.stdout).trim()] });
    });
  const onBranch = (exitCode = 0) => ({
    'process.run': () => Promise.resolve({ stdout: 'feature/auth\n', exitCode }),
  });

  spec('mods.events.Rewrite or add to a prompt', () => {
    test('next({ ...e, text }) rewrites the prompt: later hooks and Claude Code receive the new text and never see the original', async () => {
      const h = eventHarness();
      const later: unknown[] = [];
      h.mod('trim', 'user', [
        fn('prompt.submit', (_$, e, next) => next({ ...e, text: String(e.text).trim() })),
      ]);
      h.mod('later', 'user', [fn('prompt.submit', (_$, e, next) => (later.push(e.text), next(e)))]);
      await h.fire('prompt.submit', { text: '  fix the bug  ' });
      expect(later).toEqual(['fix the bug']);
      expect(h.coreSeen).toEqual([{ text: 'fix the bug' }]);
    });

    test('next({ ...e, context: [...(e.context ?? []), extra] }) adds text only Claude reads, after the prompt, and keeps what an earlier hook added', async () => {
      const h = eventHarness();
      h.mod('first', 'user', [
        fn('prompt.submit', (_$, e, next) =>
          next({ ...e, context: [...(Array.isArray(e.context) ? e.context : []), 'one'] }),
        ),
      ]);
      h.mod('second', 'user', [
        fn('prompt.submit', (_$, e, next) =>
          next({ ...e, context: [...(Array.isArray(e.context) ? e.context : []), 'two'] }),
        ),
      ]);
      await h.fire('prompt.submit', { text: 'hello' });
      expect(h.coreSeen).toEqual([{ text: 'hello', context: ['one', 'two'] }]);
    });

    test('the example adds the current branch name when a prompt mentions a pull request', async () => {
      const h = eventHarness();
      h.mod('branch', 'user', [branchHook()], onBranch());
      await h.fire('prompt.submit', { text: 'open a PR for this change' });
      expect(h.coreSeen).toEqual([
        { text: 'open a PR for this change', context: ['Current branch: feature/auth'] },
      ]);
    });

    test('a prompt that does not mention a pull request goes through unchanged and git does not run', async () => {
      const h = eventHarness();
      let ran = 0;
      h.mod('branch', 'user', [branchHook()], {
        'process.run': () => ((ran += 1), Promise.resolve({ stdout: '', exitCode: 0 })),
      });
      await h.fire('prompt.submit', { text: 'explain this function' });
      expect(h.coreSeen).toEqual([{ text: 'explain this function' }]);
      expect(ran).toBe(0);
    });

    test('outside a git repository the command fails, so there is no branch to add', async () => {
      const h = eventHarness();
      h.mod('branch', 'user', [branchHook()], onBranch(128));
      await h.fire('prompt.submit', { text: 'review the pull request' });
      expect(h.coreSeen).toEqual([{ text: 'review the pull request' }]);
    });
  });

  spec('mods.events.Rewrite or add to a prompt.Stop the prompt from being sent', () => {
    const drop = () =>
      fn('prompt.submit', () => Promise.resolve({ drop: 'Secrets do not belong in a prompt.' }));

    test('{ drop: reason } without next stops the prompt: Claude Code never receives it, and the user sees "Prompt dropped by a hook:" and the reason', async () => {
      const h = eventHarness();
      h.mod('filter', 'user', [drop()]);
      const result = record(await h.fire('prompt.submit', { text: 'my key is sk-123' }));
      expect(h.coreSeen).toEqual([]);
      expect(promptDroppedText(String(result.drop))).toBe(
        'Prompt dropped by a hook: Secrets do not belong in a prompt.',
      );
    });

    test('a drop returned after next(e) let the prompt through does not stop it: the turn still runs and the hook fails with "a drop after its next() was answered"', async () => {
      const h = eventHarness();
      h.mod('late', 'user', [
        fn('prompt.submit', async (_$, e, next) => {
          await next(e);
          return { drop: 'too late' };
        }),
      ]);
      const result = await h.fire('prompt.submit', { text: 'hello' });
      expect(result).toEqual({ core: { text: 'hello' } });
      expect(h.coreSeen).toHaveLength(1);
      expect(reasonsOf(h)[0]).toContain('a drop after its next() was answered');
    });

    test('a hook that throws or times out is skipped and the prompt is sent', async () => {
      const throwing = eventHarness();
      throwing.mod('flaky', 'user', [fn('prompt.submit', () => Promise.reject(new Error('boom')))]);
      expect(await throwing.fire('prompt.submit', { text: 'hello' })).toEqual({
        core: { text: 'hello' },
      });
      const slow = eventHarness();
      slow.mod('slow', 'user', [fn('prompt.submit', () => new Promise(() => undefined))]);
      const pending = slow.fire('prompt.submit', { text: 'hello' });
      await flush();
      slow.clock.advance(10_000);
      expect(await pending).toEqual({ core: { text: 'hello' } });
    });

    test('a .catch handler that returns { drop } keeps a failure from sending a prompt the hook would have stopped', async () => {
      const h = eventHarness();
      h.mod('strict', 'user', [
        fn('prompt.submit', () => Promise.reject(new Error('boom')), {
          handler: (_$, _e, next) =>
            Promise.resolve(
              next.called ? undefined : { drop: 'The filter failed, so the prompt was not sent.' },
            ),
        }),
      ]);
      expect(await h.fire('prompt.submit', { text: 'hello' })).toEqual({
        drop: 'The filter failed, so the prompt was not sent.',
      });
      expect(h.coreSeen).toEqual([]);
    });
  });
});
