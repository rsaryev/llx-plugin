/**
 * The subagent events. plugins/mods/reference.md § Subagents (including the resumed run under
 * `agent.spawn`). When a subagent type is offered or a subagent starts is the host's; the tests
 * fire both through the chain.
 */
import { describe, expect, test } from 'bun:test';
import { eventInputProblem } from '../../../src/mods/events/index.ts';
import { fn } from '../../support/mods-chain.ts';
import { eventHarness, reasonsOf } from '../../support/mods-events.ts';
import { spec } from '../../support/spec.ts';

describe('agent.offer', () => {
  spec('mods.event.agent.offer', () => {
    test('{ isOffered: false } withholds the subagent type from Claude', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [fn('agent.offer', () => Promise.resolve({ isOffered: false }))]);
      expect(await h.fire('agent.offer', { agent: 'reviewer' })).toEqual({ isOffered: false });
      expect(h.coreSeen).toEqual([]);
    });

    test('next(e) leaves it offered, and an isOffered that is not a flag fails the hook', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [fn('agent.offer', (_$, e, next) => next(e))]);
      expect(await h.fire('agent.offer', { agent: 'reviewer' })).toEqual({
        core: { agent: 'reviewer' },
      });
      const wrong = eventHarness();
      wrong.mod('my-mod', 'user', [fn('agent.offer', () => Promise.resolve({ isOffered: 'no' }))]);
      expect(await wrong.fire('agent.offer', {})).toEqual({ core: {} });
      expect(reasonsOf(wrong)).toHaveLength(1);
    });
  });
});

describe('agent.spawn', () => {
  const spawn = { agent: 'reviewer', model: 'opus' };
  const resumed = { ...spawn, resume: { agentId: 'agent-1' } };

  spec('mods.event.agent.spawn', () => {
    test('next({ ...e, model }) chooses the model of a subagent that is starting', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [fn('agent.spawn', (_$, e, next) => next({ ...e, model: 'haiku' }))]);
      await h.fire('agent.spawn', spawn);
      expect(h.coreSeen).toEqual([{ ...spawn, model: 'haiku' }]);
    });

    test('{ deny: reason } refuses the start; nothing starts', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [
        fn('agent.spawn', () => Promise.resolve({ deny: 'too many agents' })),
      ]);
      expect(await h.fire('agent.spawn', spawn)).toEqual({ deny: 'too many agents' });
      expect(h.coreSeen).toEqual([]);
    });

    test('e.isTeammate is true for a teammate; e.resume is { agentId } for a resumed run, and a hook that counts can skip those', async () => {
      expect(eventInputProblem('agent.spawn', { ...spawn, isTeammate: true })).toBeUndefined();
      expect(eventInputProblem('agent.spawn', resumed)).toBeUndefined();
      expect(eventInputProblem('agent.spawn', { resume: {} })).toContain('resume');
      const h = eventHarness();
      let started = 0;
      h.mod('my-mod', 'user', [
        fn('agent.spawn', (_$, e, next) => (e.resume ? next(e) : (started++, next(e)))),
      ]);
      await h.fire('agent.spawn', spawn);
      await h.fire('agent.spawn', resumed);
      expect(started).toBe(1);
    });

    test('{ deny } refuses a resumed run: the run does not start', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [
        fn('agent.spawn', () => Promise.resolve({ deny: 'no resumes today' }), { matcher: {} }),
      ]);
      expect(await h.fire('agent.spawn', resumed)).toEqual({ deny: 'no resumes today' });
      expect(h.coreSeen).toEqual([]);
    });

    test('a changed event passed to next for a resumed run is ignored by Claude Code; the hooks after it still see it', async () => {
      const h = eventHarness();
      const seen: unknown[] = [];
      h.mod('first', 'user', [fn('agent.spawn', (_$, e, next) => next({ ...e, model: 'haiku' }))]);
      h.mod('second', 'user', [fn('agent.spawn', (_$, e, next) => (seen.push(e.model), next(e)))]);
      await h.fire('agent.spawn', resumed);
      expect(seen).toEqual(['haiku']);
      expect(h.coreSeen).toEqual([resumed]);
    });

    test('a deny that is not a string fails the hook and the subagent starts', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [fn('agent.spawn', () => Promise.resolve({ deny: 1 }))]);
      expect(await h.fire('agent.spawn', spawn)).toEqual({ core: spawn });
      expect(reasonsOf(h)).toHaveLength(1);
    });
  });
});
