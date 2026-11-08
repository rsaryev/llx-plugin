/**
 * `tool.check`. plugins/mods/events.md § Approve or refuse a tool call before the user is asked,
 * § Check whether a tool call is read-only, § Handle a hook that fails (the refusal at `tool.check`);
 * plugins/mods/reference.md § Tools ("Agent and organization fields" and "The `e.isReadOnly` field").
 * The permission mode, the rules and the prompt are the host's: the tests fire `tool.check` through
 * the chain with a `core` that stands for Claude Code's own decision, and a prompt that is shown only
 * once the chain has answered.
 */
import { describe, expect, test } from 'bun:test';
import { eventInputProblem } from '../../../src/mods/events/index.ts';
import { flush, fn, record } from '../../support/mods-chain.ts';
import { eventHarness, reasonsOf } from '../../support/mods-events.ts';
import { spec } from '../../support/spec.ts';

const check = { tool: 'Bash', input: { command: 'git push origin main' } };

/** The hook of events.md: deny `git push` while the branch is `main`. */
const pushGuard = () =>
  fn(
    'tool.check',
    async ($, e, next) => {
      const decided = await next(e);
      if (!String(record(e.input).command).includes('git push')) return decided;
      const branch = record(await $.process.run(['git', 'branch', '--show-current']));
      if (String(branch.stdout).trim() !== 'main') return decided;
      return { decision: 'deny', reason: 'Push from a branch other than main' };
    },
    { matcher: { tool: 'Bash' } },
  );
const onBranch = (name: string) => ({
  'process.run': () => Promise.resolve({ stdout: `${name}\n`, exitCode: 0 }),
});
const ALLOWED = () => Promise.resolve({ decision: 'allow' });

describe('approve or refuse a tool call before the user is asked', () => {
  spec('mods.events.Approve or refuse a tool call before the user is asked', () => {
    test('the example hook denies git push while the branch is main and passes every other call through', async () => {
      const h = eventHarness();
      h.mod('branch-guard', 'user', [pushGuard()], onBranch('main'));
      expect(await h.fire('tool.check', check, { core: ALLOWED })).toEqual({
        decision: 'deny',
        reason: 'Push from a branch other than main',
      });
      const other = { tool: 'Bash', input: { command: 'npm test' } };
      expect(await h.fire('tool.check', other, { core: ALLOWED })).toEqual({ decision: 'allow' });
      const read = { tool: 'Read', input: { file_path: 'a.ts' } };
      expect(await h.fire('tool.check', read, { core: ALLOWED })).toEqual({ decision: 'allow' });
    });

    test('the hook matches the text of the command, so it is a reminder for Claude and not a protection', async () => {
      const h = eventHarness();
      h.mod('branch-guard', 'user', [pushGuard()], onBranch('main'));
      const echo = { tool: 'Bash', input: { command: 'echo "git push"' } };
      expect(await h.fire('tool.check', echo, { core: ALLOWED })).toMatchObject({
        decision: 'deny',
      });
      const renamed = { tool: 'Bash', input: { command: 'git  push origin main' } };
      expect(await h.fire('tool.check', renamed, { core: ALLOWED })).toEqual({ decision: 'allow' });
    });
  });

  spec('mods.events.Approve or refuse a tool call before the user is asked.On main', () => {
    test('the hook returns deny, even when a rule allows git push', async () => {
      const h = eventHarness();
      h.mod('branch-guard', 'user', [pushGuard()], onBranch('main'));
      const rule = () => Promise.resolve({ decision: 'allow', reason: 'Bash(git push:*)' });
      expect(await h.fire('tool.check', check, { core: rule })).toEqual({
        decision: 'deny',
        reason: 'Push from a branch other than main',
      });
    });

    test('on another branch the call gets the decision it would get without the mod, reason included', async () => {
      const h = eventHarness();
      h.mod('branch-guard', 'user', [pushGuard()], onBranch('feature/login'));
      const rule = () => Promise.resolve({ decision: 'ask', reason: 'Bash(git push:*)' });
      expect(await h.fire('tool.check', check, { core: rule })).toEqual({
        decision: 'ask',
        reason: 'Bash(git push:*)',
      });
    });
  });

  spec('mods.events.Approve or refuse a tool call before the user is asked.What to return', () => {
    test('an object of your own decides the call: allow, or deny with a reason', async () => {
      for (const own of [{ decision: 'allow' }, { decision: 'deny', reason: 'No pushes.' }]) {
        const h = eventHarness();
        h.mod('decider', 'user', [fn('tool.check', () => Promise.resolve(own))]);
        expect(
          await h.fire('tool.check', check, { core: () => Promise.resolve({ decision: 'ask' }) }),
        ).toEqual(own);
      }
    });

    test('what await next(e) gives you leaves the decision alone', async () => {
      const h = eventHarness();
      h.mod('passing', 'user', [fn('tool.check', async (_$, e, next) => await next(e))]);
      const core = () => Promise.resolve({ decision: 'ask', reason: 'a rule' });
      expect(await h.fire('tool.check', check, { core })).toEqual({
        decision: 'ask',
        reason: 'a rule',
      });
    });

    test('a decision that is not allow, ask or deny, or a bare string, is the wrong shape: the hook fails and the decision stands', async () => {
      for (const wrong of [{ decision: 'maybe' }, 'allow', { reason: 'no decision' }]) {
        const h = eventHarness();
        h.mod('wrong', 'user', [fn('tool.check', () => Promise.resolve(wrong))]);
        const core = () => Promise.resolve({ decision: 'ask' });
        expect(await h.fire('tool.check', check, { core })).toEqual({ decision: 'ask' });
        expect(reasonsOf(h)).toHaveLength(1);
      }
    });
  });

  spec(
    'mods.events.Approve or refuse a tool call before the user is asked.What await next(e) gives you',
    () => {
      test("Claude Code's own decision, as an object whose decision is allow, ask or deny", async () => {
        for (const decision of ['allow', 'ask', 'deny']) {
          const h = eventHarness();
          let seen: unknown;
          h.mod('watcher', 'user', [
            fn('tool.check', async (_$, e, next) => {
              seen = await next(e);
              return seen;
            }),
          ]);
          await h.fire('tool.check', check, { core: () => Promise.resolve({ decision }) });
          expect(seen).toEqual({ decision });
        }
      });
    },
  );

  spec('mods.events.Approve or refuse a tool call before the user is asked.Arguments', () => {
    test('e.input holds the tool arguments, such as command for Bash', async () => {
      const h = eventHarness();
      const seen: unknown[] = [];
      h.mod('reader', 'user', [fn('tool.check', (_$, e, next) => (seen.push(e.input), next(e)))]);
      await h.fire('tool.check', check);
      expect(seen).toEqual([{ command: 'git push origin main' }]);
    });

    test('an event with no input table does not fit what the docs name on tool.check', () => {
      expect(eventInputProblem('tool.check', check)).toBeUndefined();
      expect(eventInputProblem('tool.check', { tool: 'Bash' })).toContain(
        'tool.check input: input',
      );
      expect(eventInputProblem('tool.check', { tool: 'Bash', input: 'ls' })).toContain(
        'tool.check input: input',
      );
    });
  });

  spec(
    'mods.events.Approve or refuse a tool call before the user is asked.The hook throws or times out',
    () => {
      test('a hook that throws leaves the call the decision it would get without the mod', async () => {
        const h = eventHarness();
        h.mod('flaky', 'user', [
          fn('tool.check', () => Promise.reject(new Error('git is missing'))),
        ]);
        const core = () => Promise.resolve({ decision: 'ask' });
        expect(await h.fire('tool.check', check, { core })).toEqual({ decision: 'ask' });
        expect(h.reports.map((report) => report.line)).toEqual([
          'flaky: tool.check hook skipped: threw Error: git is missing',
        ]);
      });

      test('a hook that times out leaves the call the same decision', async () => {
        const h = eventHarness();
        h.mod('slow', 'user', [fn('tool.check', () => new Promise(() => undefined))]);
        const pending = h.fire('tool.check', check, {
          core: () => Promise.resolve({ decision: 'ask' }),
        });
        await flush();
        h.clock.advance(10_000);
        expect(await pending).toEqual({ decision: 'ask' });
        expect(reasonsOf(h)[0]).toContain('timed out');
      });

      test('a .catch handler that returns deny refuses the call instead', async () => {
        const h = eventHarness();
        h.mod('strict', 'user', [
          fn('tool.check', () => Promise.reject(new Error('boom')), {
            handler: () => Promise.resolve({ decision: 'deny', reason: 'the reason' }),
          }),
        ]);
        const core = () => Promise.resolve({ decision: 'allow' });
        expect(await h.fire('tool.check', check, { core })).toEqual({
          decision: 'deny',
          reason: 'the reason',
        });
      });
    },
  );

  spec('mods.events.Handle a hook that fails.tool.check', () => {
    test('a refusal returned after next resolved still holds, without testing next.called', async () => {
      const h = eventHarness();
      h.mod('guard', 'user', [
        fn(
          'tool.check',
          async (_$, e, next) => {
            await next(e);
            throw new Error('late failure');
          },
          { handler: () => Promise.resolve({ decision: 'deny', reason: 'the reason' }) },
        ),
      ]);
      const core = () => Promise.resolve({ decision: 'allow' });
      expect(await h.fire('tool.check', check, { core })).toEqual({
        decision: 'deny',
        reason: 'the reason',
      });
    });

    test('a hook that returns a refusal of the wrong shape after next stands on the result next gave', async () => {
      const h = eventHarness();
      h.mod('guard', 'user', [
        fn('tool.check', async (_$, e, next) => {
          await next(e);
          return { decision: 'perhaps' };
        }),
      ]);
      const core = () => Promise.resolve({ decision: 'allow' });
      expect(await h.fire('tool.check', check, { core })).toEqual({ decision: 'allow' });
    });
  });
});
