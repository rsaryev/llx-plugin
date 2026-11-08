import type { HookHandlerType } from '../../protocol/hook-config.ts';
import type { HookEvent } from '../../protocol/official.ts';
import type { RegisteredHandler } from '../contracts.ts';
import type { RawRun } from '../handlers/context.ts';
import { deliveryOf } from './background.ts';
import { interpretExited } from './exited.ts';
import { interpretHttp, interpretHttpFailed } from './http-response.ts';
import { interpretModel, interpretModelFailed } from './model-verdict.ts';
import { TIMED_OUT, timedOutDiscarded } from './notices.ts';
import { failureVerdict } from './on-failure.ts';
import type { Subject } from './subject.ts';
import type { HandlerVerdict, ParseOutput } from './types.ts';

/**
 * Reads one handler's raw run as the docs read it (hooks.md, "Exit code output", "HTTP response
 * handling", "Timeouts"): one reader per kind of run, a registry over the union so a run the run
 * stage learns to report is a compile error here.
 */

type RunOf<K extends RawRun['kind']> = Extract<RawRun, { readonly kind: K }>;
type Reader = (subject: Subject, run: RawRun) => HandlerVerdict;

const isRunOf = <K extends RawRun['kind']>(kind: K, run: RawRun): run is RunOf<K> =>
  run.kind === kind;

/** A run of another kind than the reader's is a bug of the registry: it is reported as not run. */
const notRun = (subject: Subject): HandlerVerdict => ({
  handler: subject.entry,
  status: 'skipped',
  succeeded: false,
  issues: [],
});

const readerOf =
  <K extends RawRun['kind']>(
    kind: K,
    read: (subject: Subject, run: RunOf<K>) => HandlerVerdict,
  ): Reader =>
  (subject, run) =>
    isRunOf(kind, run) ? read(subject, run) : notRun(subject);

const inactive =
  (status: 'cancelled' | 'skipped') =>
  (subject: Subject): HandlerVerdict => ({
    handler: subject.entry,
    status,
    succeeded: false,
    issues: [],
  });

/** The events whose docs give a timed-out hook a notice that says its output was discarded. */
const NOTICES_DISCARD: ReadonlySet<HookEvent> = new Set<HookEvent>(['UserPromptSubmit']);

/** "A `UserPromptSubmit` command, HTTP, or MCP tool hook that reaches its timeout is canceled and its output ... is discarded." */
const DISCARDS_ON_TIMEOUT: { readonly [T in HookHandlerType]: boolean } = {
  command: true,
  http: true,
  mcp_tool: true,
  prompt: false,
  agent: false,
};

const timeoutText = (subject: Subject): string =>
  NOTICES_DISCARD.has(subject.event) && DISCARDS_ON_TIMEOUT[subject.entry.handler.type]
    ? timedOutDiscarded(subject.timeoutMs)
    : TIMED_OUT;

const READERS: { readonly [K in RawRun['kind']]: Reader } = {
  exited: readerOf('exited', interpretExited),
  'timed-out': readerOf('timed-out', (subject) =>
    failureVerdict(subject, { cause: 'timeout', text: timeoutText(subject), detail: '' }),
  ),
  'not-started': readerOf('not-started', (subject, run) =>
    failureVerdict(subject, { cause: 'cannot-start', text: run.message, detail: run.message }),
  ),
  cancelled: readerOf('cancelled', inactive('cancelled')),
  skipped: readerOf('skipped', inactive('skipped')),
  background: readerOf('background', (subject, run) => ({
    handler: subject.entry,
    status: 'background',
    succeeded: false,
    issues: [],
    delivery: run.done.then((result) => deliveryOf(subject.entry.id, result)),
  })),
  http: readerOf('http', interpretHttp),
  'http-failed': readerOf('http-failed', interpretHttpFailed),
  // "Claude Code reads the tool's text content the same way it reads command-hook stdout ... If the
  // tool returns `isError: true`, the hook produces a non-blocking error and execution continues."
  mcp: readerOf('mcp', (subject, run) =>
    run.isError
      ? failureVerdict(subject, { cause: 'tool-error', text: run.text, detail: run.text })
      : interpretExited(subject, { exitCode: 0, stdout: run.text, stderr: '' }),
  ),
  model: readerOf('model', interpretModel),
  'model-failed': readerOf('model-failed', interpretModelFailed),
};

/** What the run of `entry` on `event` came to. */
export interface InterpretContext {
  readonly event: HookEvent;
  /** The facts the event fired with. */
  readonly facts: object;
  readonly parse: ParseOutput;
  /** A Monitor call reached the hook through a `Bash` matcher. */
  readonly effectsIgnored?: boolean;
  /** The limit the handler ran under, in milliseconds (`handlerTimeoutMs`); absent for none. */
  readonly timeoutMs?: number | undefined;
  /** The host runs Windows without Git Bash (its default shell is PowerShell). */
  readonly gitBashMissing?: boolean;
}

const toolNameOf = (facts: object): string | undefined =>
  'tool_name' in facts && typeof facts.tool_name === 'string' ? facts.tool_name : undefined;

export function interpretRun(
  entry: RegisteredHandler,
  run: RawRun,
  context: InterpretContext,
): HandlerVerdict {
  const subject: Subject = {
    entry,
    event: context.event,
    facts: context.facts,
    toolName: toolNameOf(context.facts),
    parse: context.parse,
    timeoutMs: context.timeoutMs,
    effectsIgnored: context.effectsIgnored === true,
    gitBashMissing: context.gitBashMissing === true,
  };
  return READERS[run.kind](subject, run);
}
