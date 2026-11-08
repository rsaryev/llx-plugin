/**
 * hooks.md § Hook handler fields, "Common fields" (`timeout`: "Seconds before canceling. Claude
 * Code doesn't enforce it on a command hook you run with `async: true`. Defaults: 600 for
 * `command`, `http`, and `mcp_tool`; 30 for `prompt`; 60 for `agent`. Claude Code lowers the
 * `command`, `http`, and `mcp_tool` default to 30 on UserPromptSubmit, PreModelSwitch, and
 * PostModelSwitch, and to 10 on MessageDisplay. SessionEnd hooks share a 1.5-second budget; if
 * your settings set a longer per-hook `timeout`, Claude Code raises the budget to match, up to 60
 * seconds"), § Exit code output, "Timeouts" ("cancels a `command`, `http`, or `mcp_tool` hook that
 * reaches its `timeout`, discarding the hook's output"), § SessionEnd ("Timeouts set on
 * plugin-provided hooks don't raise the budget"; `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS`
 * "override[s] the budget explicitly. The value you set also becomes the timeout for each hook
 * without its own `timeout`").
 *
 * The kit computes the limit and hands it to the port; enforcing it is the port's, so the proof is
 * the number the port receives and the run the kit reports when the port says `timedOut`.
 */
import { describe, expect, test } from 'bun:test';
import { runHandler } from '../../../src/hooks/handlers/index.ts';
import { handlerTimeoutMs, planTimeouts } from '../../../src/hooks/handlers/index.ts';
import type { RegisteredHandler } from '../../../src/hooks/contracts.ts';
import type { HookHandler, HookHandlerType } from '../../../src/protocol/hook-config.ts';
import type { HookEvent } from '../../../src/protocol/official.ts';
import {
  agentSource,
  entry,
  pluginSource,
  settingsSource,
  skillSource,
} from '../../support/hooks-select.ts';
import { planFor, runContext, settingsCommand } from '../../support/hooks-run.ts';
import { fakeEnvironment, scriptedRunner } from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';

const HANDLERS: { readonly [T in HookHandlerType]: HookHandler } = {
  command: { type: 'command', command: './h.sh' },
  http: { type: 'http', url: 'https://x.test' },
  mcp_tool: { type: 'mcp_tool', server: 's', tool: 't' },
  prompt: { type: 'prompt', prompt: 'p' },
  agent: { type: 'agent', prompt: 'p' },
};

const withTimeout = (handler: HookHandler, timeout: number | undefined): HookHandler =>
  timeout === undefined ? handler : { ...handler, timeout };

const handlerOf = (
  event: HookEvent,
  type: HookHandlerType,
  timeout?: number,
  options: { source?: RegisteredHandler['source'] } = {},
): RegisteredHandler => entry(event, { handler: withTimeout(HANDLERS[type], timeout), ...options });

const ms = (
  handler: RegisteredHandler,
  environment = fakeEnvironment(),
  others: RegisteredHandler[] = [],
) => handlerTimeoutMs(handler, planFor(handler, environment, others));

const rewake = (timeout?: number) =>
  entry('PostToolUse', {
    handler: {
      type: 'command',
      command: './h.sh',
      async: true,
      asyncRewake: true,
      ...(timeout === undefined ? {} : { timeout }),
    },
  });

const sessionEnd = (timeout?: number, source = settingsSource) =>
  handlerOf('SessionEnd', 'command', timeout, { source });

spec('hooks.handler.common.timeout', () => {
  describe('defaults', () => {
    const DEFAULTS: readonly (readonly [HookHandlerType, number])[] = [
      ['command', 600_000],
      ['http', 600_000],
      ['mcp_tool', 600_000],
      ['prompt', 30_000],
      ['agent', 60_000],
    ];
    for (const [type, expected] of DEFAULTS) {
      test(`${type} defaults to ${expected / 1000} seconds`, () => {
        expect(ms(handlerOf('PostToolUse', type))).toBe(expected);
      });
    }
  });

  describe('an event lowers the default of command, http and mcp_tool', () => {
    const LOWERED: readonly (readonly [HookEvent, number])[] = [
      ['UserPromptSubmit', 30_000],
      ['PreModelSwitch', 30_000],
      ['PostModelSwitch', 30_000],
      ['MessageDisplay', 10_000],
    ];
    for (const [event, expected] of LOWERED) {
      test(`${event}: ${expected / 1000} seconds`, () => {
        for (const type of ['command', 'http', 'mcp_tool'] as const) {
          expect(ms(handlerOf(event, type))).toBe(expected);
        }
      });
    }

    test('the prompt and agent defaults stay what they are', () => {
      expect(ms(handlerOf('UserPromptSubmit', 'prompt'))).toBe(30_000);
      expect(ms(handlerOf('UserPromptSubmit', 'agent'))).toBe(60_000);
    });

    test('other events keep 600 seconds', () => {
      expect(ms(handlerOf('Stop', 'command'))).toBe(600_000);
    });

    test('a timeout set on the hook wins over the lowered default, longer or shorter', () => {
      expect(ms(handlerOf('UserPromptSubmit', 'command', 120))).toBe(120_000);
      expect(ms(handlerOf('MessageDisplay', 'command', 25))).toBe(25_000);
      expect(ms(handlerOf('PostToolUse', 'command', 5))).toBe(5000);
    });
  });

  test('a timeout is in seconds and may be fractional', () => {
    expect(ms(handlerOf('PostToolUse', 'prompt', 0.5))).toBe(500);
  });

  describe('async: true', () => {
    test('is not enforced: no limit, whatever timeout is set', () => {
      const async = entry('PostToolUse', {
        handler: { type: 'command', command: './h.sh', async: true, timeout: 5 },
      });
      expect(ms(async)).toBeUndefined();
    });

    test('asyncRewake still enforces it, with the default or the one set', () => {
      expect(ms(rewake())).toBe(600_000);
      expect(ms(rewake(7))).toBe(7000);
    });
  });

  describe('SessionEnd shares a 1.5-second budget', () => {
    test('a hook with no timeout gets 1.5 seconds', () => {
      expect(ms(sessionEnd())).toBe(1500);
    });

    test('a longer per-hook timeout in settings raises the budget to match', () => {
      expect(ms(sessionEnd(20))).toBe(20_000);
    });

    test('the budget is the highest per-hook timeout, and a hook without one keeps the default', () => {
      const long = sessionEnd(30);
      const none = sessionEnd();
      const short = sessionEnd(5);
      expect(ms(long, fakeEnvironment(), [none, short])).toBe(30_000);
      expect(ms(none, fakeEnvironment(), [long, short])).toBe(1500);
      expect(ms(short, fakeEnvironment(), [long, none])).toBe(5000);
    });

    test('the budget is raised up to 60 seconds and no further', () => {
      expect(ms(sessionEnd(120))).toBe(60_000);
    });

    test('a timeout under 1.5 seconds is kept', () => {
      expect(ms(sessionEnd(1))).toBe(1000);
    });

    test('timeouts set on plugin-provided hooks do not raise the budget', () => {
      const plugin = sessionEnd(30, pluginSource());
      expect(ms(sessionEnd(), fakeEnvironment(), [plugin])).toBe(1500);
    });

    test('a plugin hook shares the budget a settings hook raised', () => {
      const settings = sessionEnd(30);
      const plugin = sessionEnd(30, pluginSource());
      expect(ms(plugin, fakeEnvironment(), [settings])).toBe(30_000);
    });

    describe('CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS', () => {
      const environment = fakeEnvironment({ CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS: '5000' });

      test('sets the budget and the timeout of each hook without its own', () => {
        expect(ms(sessionEnd(), environment)).toBe(5000);
      });

      test('a hook with its own timeout keeps it, within the budget', () => {
        expect(ms(sessionEnd(2), environment)).toBe(2000);
      });

      test('overrides the budget a per-hook timeout would have raised', () => {
        expect(ms(sessionEnd(30), environment)).toBe(5000);
      });
    });

    test('other events have no shared budget', () => {
      expect(planTimeouts('Stop', [handlerOf('Stop', 'command')], fakeEnvironment())).toEqual({});
    });
  });

  describe('the port enforces the limit, the kit passes it and reads the answer', () => {
    test('the command runner receives timeoutMs from the plan', async () => {
      const runner = scriptedRunner({});
      const hook = settingsCommand({ command: './h.sh', timeout: 12 }, 'UserPromptSubmit');
      await runHandler(hook, runContext({ runner, timeouts: planFor(hook) }));
      expect(runner.calls[0]?.timeoutMs).toBe(12_000);
    });

    test('the lowered default reaches the runner', async () => {
      const runner = scriptedRunner({});
      const hook = settingsCommand({ command: './h.sh' }, 'MessageDisplay');
      await runHandler(hook, runContext({ runner, timeouts: planFor(hook) }));
      expect(runner.calls[0]?.timeoutMs).toBe(10_000);
    });

    test('a hook that reaches its timeout is canceled and its output discarded', async () => {
      const runner = scriptedRunner({
        exitCode: null,
        timedOut: true,
        stdout: '{"decision":"block"}',
        stderr: 'partial',
      });
      const hook = settingsCommand({ command: './h.sh' });
      const { run } = await runHandler(hook, runContext({ runner, timeouts: planFor(hook) }));
      expect(run).toEqual({ kind: 'timed-out' });
    });
  });
});

describe('judgments', () => {
  test('a timeout that is not a positive number counts as unset', () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(ms(handlerOf('PostToolUse', 'command', bad))).toBe(600_000);
    }
  });

  test('only settings-file hooks raise the SessionEnd budget: a skill or agent hook does not', () => {
    const skill = handlerOf('SessionEnd', 'command', 30, { source: skillSource });
    const agent = handlerOf('SessionEnd', 'command', 30, { source: agentSource });
    expect(ms(skill)).toBe(1500);
    expect(ms(agent)).toBe(1500);
  });

  test('a plugin hook with a longer timeout is capped at the budget that settings left', () => {
    expect(ms(sessionEnd(30, pluginSource()))).toBe(1500);
  });

  test('a hook never runs longer than the shared budget', () => {
    const plugin = handlerOf('SessionEnd', 'command', 45, { source: pluginSource() });
    const settings = handlerOf('SessionEnd', 'command', 10);
    expect(ms(plugin, fakeEnvironment(), [settings])).toBe(10_000);
  });

  test('an environment override that is not a positive whole number of milliseconds is ignored', () => {
    for (const text of ['', 'abc', '-5', '0', '1.5', '5s']) {
      const environment = fakeEnvironment({ CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS: text });
      expect(ms(handlerOf('SessionEnd', 'command'), environment)).toBe(1500);
    }
  });
});
