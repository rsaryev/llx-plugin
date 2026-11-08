/**
 * When `tool.check` fires. plugins/mods/events.md § Approve or refuse a tool call before the user is
 * asked ("When `tool.check` fires": after the `PreToolUse` hooks run, and before the permission prompt).
 * The host composes the order, as in `tests/mods/load/settings-hooks-order.test.ts`: the `tool.call` hooks,
 * the settings `PreToolUse` hooks run by the kit's hook engine, `tool.check`, then the prompt.
 */

import { describe, expect, test } from 'bun:test';
import { createHookEngine, createHookRegistry } from '../../../src/hooks/index.ts';
import type { RegisteredHandler } from '../../../src/hooks/index.ts';
import type { CommandRunner } from '../../../src/ports/index.ts';
import { fn, record } from '../../support/mods-chain.ts';
import { eventHarness } from '../../support/mods-events.ts';
import {
  entry,
  FACTS,
  session as hookSession,
  settingsSource,
} from '../../support/hooks-select.ts';
import { fakeEnvironment, locations } from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';

const check = { tool: 'Bash', input: { command: 'git push origin main' } };

describe('when tool.check fires', () => {
  spec(
    'mods.events.Approve or refuse a tool call before the user is asked.When tool.check fires',
    () => {
      /** The settings file's `PreToolUse` command hook, run by the kit's hook engine over a recording runner. */
      const preToolUse = (trace: string[], blocking = false) => {
        const commands: CommandRunner = {
          run: () => {
            trace.push('PreToolUse hook');
            return Promise.resolve({
              exitCode: blocking ? 2 : 0,
              stdout: '',
              stderr: blocking ? 'blocked' : '',
              timedOut: false,
            });
          },
        };
        const engine = createHookEngine({
          commands,
          locations: locations(),
          environment: fakeEnvironment(),
        });
        const hooks: RegisteredHandler[] = [
          entry('PreToolUse', {
            source: settingsSource,
            handler: { type: 'command', command: 'pre.sh' },
          }),
        ];
        return () =>
          engine.dispatch(createHookRegistry(hooks), {
            event: 'PreToolUse',
            facts: FACTS.PreToolUse,
            session: hookSession(),
            signal: new AbortController().signal,
          });
      };

      /** What the host does with one call: `tool.call` hooks, whose end runs the `PreToolUse` hooks, then `tool.check`, then the prompt. */
      const runCall = async (trace: string[], blocking = false) => {
        const h = eventHarness();
        h.mod('watcher', 'user', [
          fn('tool.call', (_$, e, next) => (trace.push('tool.call hook'), next(e))),
          fn('tool.check', async (_$, e, next) => {
            trace.push('tool.check hook');
            return next(e);
          }),
        ]);
        const pre = preToolUse(trace, blocking);
        return h.fire(
          'tool.call',
          { tool: 'Bash', command: 'ls' },
          {
            core: async () => {
              const outcome = await pre();
              if (!outcome.proceed) return { deny: outcome.block?.reason };
              const decided = record(
                await h.fire('tool.check', check, {
                  core: () => {
                    trace.push('rules and mode decide');
                    return Promise.resolve({ decision: 'ask' });
                  },
                }),
              );
              if (decided.decision === 'ask') trace.push('permission prompt');
              return decided;
            },
          },
        );
      };

      test('after the tool.call and PreToolUse hooks run, and before the permission prompt', async () => {
        const trace: string[] = [];
        await runCall(trace);
        expect(trace).toEqual([
          'tool.call hook',
          'PreToolUse hook',
          'tool.check hook',
          'rules and mode decide',
          'permission prompt',
        ]);
      });

      test('a PreToolUse hook that blocks the call keeps tool.check from firing for it', async () => {
        const trace: string[] = [];
        const result = await runCall(trace, true);
        expect(trace).toEqual(['tool.call hook', 'PreToolUse hook']);
        expect(result).toMatchObject({ deny: expect.stringContaining('blocked') });
      });

      test('a hook that answers without next never reaches the decision, so the prompt is skipped for its allow', async () => {
        const h = eventHarness();
        const decisions: unknown[] = [];
        h.mod('approver', 'user', [fn('tool.check', () => Promise.resolve({ decision: 'allow' }))]);
        const decided = record(
          await h.fire('tool.check', check, {
            core: () => (decisions.push('rules'), Promise.resolve({ decision: 'ask' })),
          }),
        );
        expect(decided).toEqual({ decision: 'allow' });
        expect(decisions).toEqual([]);
      });
    },
  );
});
