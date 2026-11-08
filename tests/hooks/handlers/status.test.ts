/**
 * hooks.md § Hook handler fields, "Common fields": `statusMessage` is a "Custom spinner message
 * displayed while the hook runs". Showing a spinner is the host's job; the kit's part is to tell the
 * host, when a hook starts, which hook it is and the message it set, for every handler type.
 */
import { describe, expect, test } from 'bun:test';
import { runHandler, type HookStarted } from '../../../src/hooks/handlers/index.ts';
import { entry } from '../../support/hooks-select.ts';
import { runContext, settingsCommand } from '../../support/hooks-run.ts';
import { scriptedRunner } from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';

const observed = () => {
  const started: HookStarted[] = [];
  return { started, observer: { started: (info: HookStarted) => started.push(info) } };
};

spec('hooks.handler.common.statusMessage', () => {
  test('a command hook announces its own statusMessage, verbatim, once, when it starts', async () => {
    const { started, observer } = observed();
    const hook = settingsCommand(
      { command: './lint.sh', statusMessage: 'Linting...' },
      'PostToolUse',
    );
    await runHandler(hook, runContext({ runner: scriptedRunner({}), observer }));
    expect(started).toEqual([
      { event: 'PostToolUse', handlerId: hook.id, statusMessage: 'Linting...' },
    ]);
  });

  test('the message arrives before the process runs, not after', async () => {
    const { started, observer } = observed();
    let seenAtRun = 0;
    const runner = scriptedRunner(() => {
      seenAtRun = started.length;
      return {};
    });
    await runHandler(
      settingsCommand({ command: './lint.sh', statusMessage: 'Linting...' }),
      runContext({ runner, observer }),
    );
    expect(seenAtRun).toBe(1);
  });

  test('a hook with no statusMessage announces none, for the host to label', async () => {
    const { started, observer } = observed();
    await runHandler(
      settingsCommand({ command: './lint.sh' }),
      runContext({ runner: scriptedRunner({}), observer }),
    );
    expect(started).toHaveLength(1);
    expect(started[0]).not.toHaveProperty('statusMessage');
  });

  test('every handler type announces it: the field is common', async () => {
    const { started, observer } = observed();
    const handlers = [
      { type: 'http', url: 'https://x.test', statusMessage: 'http' },
      { type: 'mcp_tool', server: 's', tool: 't', statusMessage: 'mcp' },
      { type: 'prompt', prompt: 'p', statusMessage: 'prompt' },
      { type: 'agent', prompt: 'p', statusMessage: 'agent' },
    ] as const;
    for (const handler of handlers) {
      await runHandler(
        entry('Stop', { handler }),
        runContext({ runner: scriptedRunner(), observer }),
      );
    }
    expect(started.map(({ statusMessage }) => statusMessage)).toEqual([
      'http',
      'mcp',
      'prompt',
      'agent',
    ]);
  });

  describe('without an observer', () => {
    test('the hook still runs', async () => {
      const runner = scriptedRunner({});
      await runHandler(
        settingsCommand({ command: './lint.sh', statusMessage: 'x' }),
        runContext({ runner }),
      );
      expect(runner.calls).toHaveLength(1);
    });
  });
});

describe('judgment: statusMessage plumbing', () => {
  test('an async hook announces it too: it is running', async () => {
    const { started, observer } = observed();
    await runHandler(
      settingsCommand({ command: './t.sh', async: true, statusMessage: 'Testing...' }),
      runContext({ runner: scriptedRunner({}), observer }),
    );
    expect(started.map(({ statusMessage }) => statusMessage)).toEqual(['Testing...']);
  });

  test('an observer with no started callback is fine: the hook still runs', async () => {
    const runner = scriptedRunner({});
    const { run } = await runHandler(
      settingsCommand({ command: './lint.sh' }),
      runContext({ runner, observer: {} }),
    );
    expect(run.kind).toBe('exited');
    expect(runner.calls).toHaveLength(1);
  });
});
