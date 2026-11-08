/**
 * The tool events. plugins/mods/reference.md § Tools (and its "Agent and organization fields" and
 * "The `e.isReadOnly` field" sections); plugins/mods/events.md § Guard or change a tool call and
 * § Approve or refuse a tool call before the user is asked; permissions.md § Hook approvals in plan
 * mode. Firing is the host's: these tests fire each event through the chain the way the host will.
 */
import { describe, expect, test } from 'bun:test';
import { fn, record } from '../../support/mods-chain.ts';
import { eventHarness, reasonsOf } from '../../support/mods-events.ts';
import { spec } from '../../support/spec.ts';

const bash = { tool: 'Bash', command: 'git push --force' };

describe('tool.call', () => {
  spec('mods.event.tool.call', () => {
    test('observing: next(e) runs the tool as it would run without the mod', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [fn('tool.call', (_$, e, next) => next(e))]);
      expect(await h.fire('tool.call', bash)).toEqual({ core: bash });
    });

    test('answering without next: { deny } is the result and the tool never runs', async () => {
      const h = eventHarness();
      const reason = 'Bash is turned off in this project. Use the file tools.';
      h.mod('my-mod', 'user', [
        fn('tool.call', () => Promise.resolve({ deny: reason }), { matcher: { tool: 'Bash' } }),
      ]);
      expect(await h.fire('tool.call', bash)).toEqual({ deny: reason });
      expect(h.coreSeen).toEqual([]);
      expect(await h.fire('tool.call', { tool: 'Read' })).toEqual({ core: { tool: 'Read' } });
    });

    test('answering without next: { result } is what Claude learns, and the tool does not run', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [
        fn('tool.call', () => Promise.resolve({ result: { stdout: 'stubbed' } })),
      ]);
      expect(await h.fire('tool.call', bash)).toEqual({ result: { stdout: 'stubbed' } });
      expect(h.coreSeen).toEqual([]);
    });

    test('a changed call: the arguments passed to next are what the tool receives', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [
        fn('tool.call', (_$, e, next) => next({ ...e, command: 'git push' })),
      ]);
      await h.fire('tool.call', bash);
      expect(h.coreSeen).toEqual([{ tool: 'Bash', command: 'git push' }]);
    });

    test('a retry: a second next(e) runs the tool again and the hook returns that result', async () => {
      const h = eventHarness();
      let calls = 0;
      h.mod('my-mod', 'user', [
        fn('tool.call', async (_$, e, next) => {
          const first = await next(e);
          return first && typeof first === 'object' && 'isError' in first ? next(e) : first;
        }),
      ]);
      const result = await h.fire('tool.call', bash, {
        core: () => Promise.resolve(++calls === 1 ? { isError: true } : { ok: true }),
      });
      expect(result).toEqual({ ok: true });
      expect(calls).toBe(2);
    });

    test('withholding: { deny } after await next(e) replaces what the tool returned; the tool did run', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [
        fn('tool.call', async (_$, e, next) => {
          await next(e);
          return { deny: 'not for Claude' };
        }),
      ]);
      expect(await h.fire('tool.call', bash)).toEqual({ deny: 'not for Claude' });
      expect(h.coreSeen).toEqual([bash]);
    });

    test('the event is deeply frozen: assigning to a field throws', async () => {
      const h = eventHarness();
      let thrown: unknown;
      h.mod('my-mod', 'user', [
        fn('tool.call', (_$, e, next) => {
          try {
            record(e).tool = 'Edit';
          } catch (error) {
            thrown = error;
          }
          return next(e);
        }),
      ]);
      await h.fire('tool.call', bash);
      expect(thrown).toBeInstanceOf(TypeError);
      expect(h.coreSeen).toEqual([bash]);
    });

    test('a result of the wrong shape fails the hook: skipped, and the tool runs', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [fn('tool.call', () => Promise.resolve({ deny: 42 }))]);
      expect(await h.fire('tool.call', bash)).toEqual({ core: bash });
      expect(reasonsOf(h)[0]).toContain('returned the wrong shape (tool.call result: deny');
    });
  });
});

/** The guard of events.md: deny `git push` while the branch is `main`. */
const guard = () =>
  fn(
    'tool.check',
    async ($, e, next) => {
      const claudeCode = await next(e);
      if (!String(record(e.input).command).includes('git push')) return claudeCode;
      const branch = record(await $.process.run(['git', 'branch', '--show-current']));
      if (String(branch.stdout).trim() !== 'main') return claudeCode;
      return { decision: 'deny', reason: 'Push from a branch other than main' };
    },
    { matcher: { tool: 'Bash' } },
  );
const onBranch = (name: string) => ({
  'process.run': () => Promise.resolve({ stdout: `${name}\n` }),
});

describe('tool.check', () => {
  const check = { tool: 'Bash', input: { command: 'git push origin main' } };
  const decided = { decision: 'allow' };

  spec('mods.event.tool.check', () => {
    test('next(e) resolves to Claude Code decision; the hook denies git push on main, even when a rule allows it', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [guard()], onBranch('main'));
      const result = await h.fire('tool.check', check, { core: () => Promise.resolve(decided) });
      expect(result).toEqual({ decision: 'deny', reason: 'Push from a branch other than main' });
    });

    test('on another branch and for other commands the call gets the decision it would get without the mod', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [guard()], onBranch('feature'));
      const core = () => Promise.resolve(decided);
      expect(await h.fire('tool.check', check, { core })).toEqual(decided);
      expect(
        await h.fire('tool.check', { tool: 'Bash', input: { command: 'ls' } }, { core }),
      ).toEqual(decided);
    });

    test('a decision is allow, ask or deny with an optional reason; anything else fails the hook', async () => {
      for (const decision of ['allow', 'ask', 'deny']) {
        const h = eventHarness();
        h.mod('my-mod', 'user', [
          fn('tool.check', () => Promise.resolve({ decision, reason: 'why' })),
        ]);
        expect(await h.fire('tool.check', check)).toEqual({ decision, reason: 'why' });
      }
      for (const wrong of [
        { decision: 'maybe' },
        { reason: 'no decision' },
        'allow',
        { decision: 'allow', reason: 7 },
      ]) {
        const h = eventHarness();
        h.mod('my-mod', 'user', [fn('tool.check', () => Promise.resolve(wrong))]);
        expect(await h.fire('tool.check', check)).toEqual({ core: check });
        expect(reasonsOf(h)).toHaveLength(1);
      }
    });

    test('a hook that fails, with a .catch that answers deny: the call is refused, also after next resolved', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [
        fn(
          'tool.check',
          async (_$, e, next) => {
            await next(e);
            throw new Error('boom');
          },
          { handler: () => Promise.resolve({ decision: 'deny', reason: 'the reason' }) },
        ),
      ]);
      expect(await h.fire('tool.check', check, { core: () => Promise.resolve(decided) })).toEqual({
        decision: 'deny',
        reason: 'the reason',
      });
    });

    test('e.isReadOnly is true or absent, never false: a matcher with isReadOnly true selects read-only calls and one with false never runs', async () => {
      const h = eventHarness();
      const seen: string[] = [];
      h.mod('my-mod', 'user', [
        fn('tool.check', (_$, e, next) => (seen.push('read-only'), next(e)), {
          matcher: { isReadOnly: true },
        }),
      ]);
      h.mod('other-mod', 'user', [
        fn('tool.check', (_$, e, next) => (seen.push('false'), next(e)), {
          matcher: { isReadOnly: false },
        }),
      ]);
      await h.fire('tool.check', { ...check, isReadOnly: true });
      await h.fire('tool.check', check);
      expect(seen).toEqual(['read-only']);
    });
  });
});

describe('tool.describe', () => {
  spec('mods.event.tool.describe', () => {
    const describing = { tool: 'Bash', description: 'Runs a shell command.' };

    test('the hook reads e.description and answers { description }, which Claude reads', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [
        fn('tool.describe', (_$, e) =>
          Promise.resolve({ description: `${String(e.description)} Be brief.` }),
        ),
      ]);
      expect(await h.fire('tool.describe', describing)).toEqual({
        description: 'Runs a shell command. Be brief.',
      });
    });

    test('isDeferred true puts the tool behind tool search and false loads it upfront', async () => {
      for (const isDeferred of [true, false]) {
        const h = eventHarness();
        h.mod('my-mod', 'user', [
          fn('tool.describe', () => Promise.resolve({ description: 'd', isDeferred })),
        ]);
        expect(await h.fire('tool.describe', describing)).toEqual({ description: 'd', isDeferred });
      }
    });

    test('an answer without a description, or with isDeferred that is not a flag, fails the hook and Claude Code description stands', async () => {
      for (const wrong of [
        { isDeferred: true },
        { description: 5 },
        { description: 'd', isDeferred: 'yes' },
      ]) {
        const h = eventHarness();
        h.mod('my-mod', 'user', [fn('tool.describe', () => Promise.resolve(wrong))]);
        expect(
          await h.fire('tool.describe', describing, {
            core: () => Promise.resolve({ description: 'core' }),
          }),
        ).toEqual({ description: 'core' });
        expect(reasonsOf(h)).toHaveLength(1);
      }
    });
  });
});
