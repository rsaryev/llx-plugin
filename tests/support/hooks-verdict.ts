/** Helpers for the tests of the verdict stage and the dispatch (hooks/verdict, hooks/dispatch). */
import type {
  HandlerVerdict,
  MergedOutput,
  OutputStage,
  ParseOutput,
  RegisteredHandler,
  TaggedOutput,
} from '../../src/hooks/index.ts';
import { interpretRun } from '../../src/hooks/index.ts';
import type { RawRun } from '../../src/hooks/handlers/index.ts';
import type { HookHandler } from '../../src/protocol/hook-config.ts';
import type { HookEvent } from '../../src/protocol/official.ts';
import { entry, FACTS } from './hooks-select.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const KEYS = new Set([
  'continue',
  'stopReason',
  'suppressOutput',
  'systemMessage',
  'terminalSequence',
  'decision',
  'reason',
  'hookSpecificOutput',
]);

/**
 * A stand-in for the output stage (`hooks/output`, another stream): an object with a key it does
 * not know, or a `continue` that is not a boolean, fails validation; the merge collects the few
 * fields the verdict and dispatch tests lean on.
 */
const fakeParse: ParseOutput = (_event, json) => {
  if (!isRecord(json)) return { failure: 'The output is not an object' };
  const unknown = Object.keys(json).find((key) => !KEYS.has(key));
  if (unknown !== undefined) return { failure: `Unrecognized field: ${unknown}` };
  if ('continue' in json && typeof json.continue !== 'boolean') {
    return { failure: 'continue: Expected boolean' };
  }
  return { output: json };
};

const field = (tagged: TaggedOutput, key: string): unknown =>
  isRecord(tagged.output) ? tagged.output[key] : undefined;

function contextOf(tagged: TaggedOutput): string[] {
  const specific = field(tagged, 'hookSpecificOutput');
  const text = isRecord(specific) ? specific.additionalContext : undefined;
  return [
    ...(typeof text === 'string' ? [text] : []),
    ...(tagged.plainText === undefined ? [] : [tagged.plainText.text]),
  ];
}

export const fakeOutput: OutputStage = {
  parse: fakeParse,
  limit: (_event, outputs) => Promise.resolve({ outputs, issues: [] }),
  merge(_event, outputs, _facts): MergedOutput {
    const blocking = outputs.find((tagged) => field(tagged, 'decision') === 'block');
    const stopping = outputs.find((tagged) => field(tagged, 'continue') === false);
    const reason = blocking === undefined ? undefined : field(blocking, 'reason');
    const stopReason = stopping === undefined ? undefined : field(stopping, 'stopReason');
    return {
      ...(blocking === undefined
        ? {}
        : {
            block: {
              via: 'decision',
              by: blocking.handler.id,
              ...(typeof reason === 'string' ? { reason } : {}),
            },
          }),
      continue: stopping === undefined,
      ...(typeof stopReason === 'string' ? { stopReason } : {}),
      systemMessages: outputs.flatMap((tagged) => {
        const message = field(tagged, 'systemMessage');
        return typeof message === 'string' ? [message] : [];
      }),
      additionalContext: outputs.flatMap(contextOf),
      terminalSequences: [],
      effects: {},
      issues: [],
    };
  },
};

export const exited = (exitCode: number, stderr = '', stdout = ''): RawRun => ({
  kind: 'exited',
  exitCode,
  stdout,
  stderr,
});

export interface VerdictOptions {
  readonly hook?: HookHandler;
  readonly facts?: object;
  readonly entry?: RegisteredHandler;
  readonly effectsIgnored?: boolean;
  /** The limit the hook ran under, in milliseconds (what the dispatch computes). */
  readonly timeoutMs?: number;
}

/** One run of a hook on `event`, read the way the engine reads it. */
export function verdictOf(
  event: HookEvent,
  run: RawRun,
  options: VerdictOptions = {},
): HandlerVerdict {
  const registered =
    options.entry ??
    entry(event, { handler: options.hook ?? { type: 'command', command: './hook.sh' } });
  const facts: object = options.facts ?? FACTS[event];
  return interpretRun(registered, run, {
    event,
    facts,
    parse: fakeParse,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.effectsIgnored === true ? { effectsIgnored: true } : {}),
  });
}
