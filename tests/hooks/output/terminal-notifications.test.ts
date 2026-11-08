/**
 * hooks.md § "Emit terminal notifications": the `terminalSequence` allowlist, the docs' script, the
 * events that discard other fields, and the two limits (only an interactive session writes it; a
 * command `WorktreeCreate` hook cannot return JSON).
 */
import { describe, expect, test } from 'bun:test';
import {
  createHookEngine,
  createHookRegistry,
  type HookSession,
} from '../../../src/hooks/index.ts';
import type { RegisteredHandler } from '../../../src/hooks/index.ts';
import type { HookEvent } from '../../../src/protocol/official.ts';
import { fire } from '../../support/hooks-fire.ts';
import { specific, stage } from '../../support/hooks-output.ts';
import { command, entry, FACTS, session } from '../../support/hooks-select.ts';
import {
  fakeEnvironment,
  locations,
  recordingHttp,
  scriptedRunner,
  type HttpReply,
  type RunnerReply,
} from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';

const ESC = '\u001b';
const BEL = '\u0007';
const ST = `${ESC}\\`;

const httpEntry = (event: HookEvent): RegisteredHandler =>
  entry(event, { handler: { type: 'http', url: 'http://wt.test/hook' } });

/** One dispatch in a session shaped by `options.session`, with the real output stage. */
async function dispatchIn(
  event: HookEvent,
  entries: readonly RegisteredHandler[],
  replies: readonly RunnerReply[],
  options: { readonly session?: Partial<HookSession>; readonly http?: readonly HttpReply[] } = {},
) {
  const engine = createHookEngine(
    {
      commands: scriptedRunner(...replies),
      locations: locations(),
      environment: fakeEnvironment(),
      http: recordingHttp(...(options.http ?? [])),
    },
    { output: stage },
  );
  return engine.dispatch(createHookRegistry(entries), {
    event,
    facts: FACTS[event] as never,
    session: session(options.session),
    signal: new AbortController().signal,
  });
}

spec('hooks.behavior.Emit terminal notifications', () => {
  /** The docs' script: a desktop notification from a Notification hook. */
  const notifyScript: RunnerReply = (run) => {
    const input = JSON.parse(run.stdin ?? '{}') as { message?: string };
    const body = input.message ?? 'Needs your attention';
    const sequence = `${ESC}]777;notify;Claude Code;${body}${BEL}`;
    return { exitCode: 0, stdout: JSON.stringify({ terminalSequence: sequence }) };
  };

  test('the docs example: the hook returns the escape sequence and Claude Code emits it', async () => {
    const outcome = await dispatchIn('Notification', [entry('Notification')], [notifyScript]);
    expect(outcome.terminalSequences).toEqual([`${ESC}]777;notify;Claude Code;m${BEL}`]);
  });

  test.each([
    ['OSC 0, window title', `${ESC}]0;title${BEL}`],
    ['OSC 1, icon title', `${ESC}]1;title${BEL}`],
    ['OSC 2, window and icon title', `${ESC}]2;title${BEL}`],
    ['OSC 9, a notification', `${ESC}]9;done${BEL}`],
    ['OSC 9;4, taskbar progress', `${ESC}]9;4;1;50${BEL}`],
    ['OSC 99, a Kitty notification', `${ESC}]99;;done${BEL}`],
    ['OSC 777, a Ghostty or Warp notification', `${ESC}]777;notify;t;b${BEL}`],
    ['a bare BEL', BEL],
    ['an OSC ended with ST', `${ESC}]0;title${ST}`],
    ['several of them', `${ESC}]0;t${BEL}${BEL}${ESC}]9;x${ST}`],
  ])('%s is emitted', async (_name, sequence) => {
    const { outcome } = await fire(
      'Notification',
      [entry('Notification')],
      [{ stdout: JSON.stringify({ terminalSequence: sequence }) }],
      { output: stage },
    );
    expect(outcome.terminalSequences).toEqual([sequence]);
  });

  test.each([
    ['a CSI cursor or color sequence', `${ESC}[31mred${ESC}[0m`],
    ['an OSC palette sequence', `${ESC}]4;1;rgb:ff/00/00${BEL}`],
    ['an OSC 8 hyperlink', `${ESC}]8;;https://example.com${BEL}`],
    ['an OSC 52 clipboard write', `${ESC}]52;c;aGVsbG8=${BEL}`],
    ['OSC 1337', `${ESC}]1337;SetUserVar=a=b${BEL}`],
    ['an allowed sequence next to a rejected one', `${BEL}${ESC}[2J`],
  ])('%s: the whole field is ignored', async (_name, sequence) => {
    const { outcome } = await fire(
      'Notification',
      [entry('Notification')],
      [{ stdout: JSON.stringify({ terminalSequence: sequence }) }],
      { output: stage },
    );
    expect(outcome.terminalSequences).toEqual([]);
    expect(outcome.issues).toHaveLength(1);
  });

  test('it works on events that discard systemMessage and continue, such as Notification and StopFailure', async () => {
    for (const event of ['Notification', 'StopFailure'] as const) {
      const body = { terminalSequence: BEL, systemMessage: 's', continue: false };
      const { outcome } = await fire(event, [entry(event)], [{ stdout: JSON.stringify(body) }], {
        output: stage,
      });
      expect(outcome.terminalSequences).toEqual([BEL]);
      expect(outcome.systemMessages).toEqual([]);
      expect(outcome.continue).toBe(true);
    }
  });

  test('Claude Code writes the sequence only in an interactive session: with -p and in the Agent SDK it ignores the field', async () => {
    const hooks = [entry('Notification')];
    const interactive = await dispatchIn('Notification', hooks, [notifyScript]);
    expect(interactive.terminalSequences).toHaveLength(1);
    const headless = await dispatchIn('Notification', hooks, [notifyScript], {
      session: { interactive: false },
    });
    expect(headless.terminalSequences).toEqual([]);
    expect(headless.proceed).toBe(true);
  });

  test('a WorktreeCreate command hook cannot return it, since its stdout is the worktree path', async () => {
    const sequence = JSON.stringify({ terminalSequence: BEL });
    const { outcome } = await fire(
      'WorktreeCreate',
      [entry('WorktreeCreate', { handler: command() })],
      [{ stdout: sequence }],
      { output: stage },
    );
    expect(outcome.terminalSequences).toEqual([]);
  });

  test('an HTTP WorktreeCreate hook returns JSON and can include it', async () => {
    const body = JSON.stringify({
      terminalSequence: `${ESC}]9;worktree ready${BEL}`,
      ...specific('WorktreeCreate', { worktreePath: '/abs/wt' }),
    });
    const { outcome } = await fire('WorktreeCreate', [httpEntry('WorktreeCreate')], [], {
      output: stage,
      http: [{ status: 200, body }],
    });
    expect(outcome.terminalSequences).toEqual([`${ESC}]9;worktree ready${BEL}`]);
    expect(outcome.effects.worktreePath).toBe('/abs/wt');
  });
});

describe('judgment: the sequence of an HTTP WorktreeCreate hook in a non-interactive session', () => {
  test('is dropped like any other', async () => {
    const body = JSON.stringify({
      terminalSequence: BEL,
      ...specific('WorktreeCreate', { worktreePath: '/abs/wt' }),
    });
    const outcome = await dispatchIn('WorktreeCreate', [httpEntry('WorktreeCreate')], [], {
      session: { interactive: false },
      http: [{ status: 200, body }],
    });
    expect(outcome.terminalSequences).toEqual([]);
    expect(outcome.effects.worktreePath).toBe('/abs/wt');
  });
});
