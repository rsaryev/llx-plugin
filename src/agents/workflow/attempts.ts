import { error, type PluginIssue } from '../../format/issues.ts';

/**
 * When an agent stalls and restarts (workflows.md, "When an agent stalls and restarts"): an agent
 * whose output stops arriving starts over from the same prompt, at most five times, so at most six
 * attempts. Pure decisions over the endings of the attempts so far; the host measures time and runs
 * the agent.
 */

/** "An agent restarts at most five times, counting any restart you ask for with `r`". */
export const MAX_RESTARTS = 5;
export const MAX_ATTEMPTS = MAX_RESTARTS + 1;

/** How an attempt ended without finishing: the whole stall window without output, a response stream that went silent, or a restart asked for. */
export const ATTEMPT_ENDINGS = ['stalled', 'lost-reply', 'restarted'] as const;
export type AttemptEnding = (typeof ATTEMPT_ENDINGS)[number];

/** How an ending reads in the list of an `abandoned` error and in the detail line (judgment for the last two). */
const ENDING_WORDS: { readonly [E in AttemptEnding]: string } = {
  stalled: 'stalled',
  'lost-reply': 'lost its reply',
  restarted: 'restarted on request',
};

/** What the detail line shows for the ending of the previous attempt: `attempt 2 (stalled)`. */
const ENDING_DETAIL: { readonly [E in AttemptEnding]: string } = {
  stalled: 'stalled',
  'lost-reply': 'lost reply',
  restarted: 'restarted',
};

/** The `/workflows` labels of an attempt: `(retry 1)` after the name, `attempt 2 (stalled)` in the detail. */
export interface AttemptLabels {
  readonly nameSuffix: string;
  readonly detail: string;
}

export interface Restart {
  readonly restart: true;
  /** The number of the attempt that starts, from 2. */
  readonly attempt: number;
  readonly labels: AttemptLabels;
}

/** Why the `agent()` call failed, and the error whose start says why. */
export const FAILURE_CAUSES = ['stalled', 'lost-reply', 'abandoned'] as const;
export type FailureCause = (typeof FAILURE_CAUSES)[number];

export interface AgentFailure {
  readonly restart: false;
  readonly cause: FailureCause;
  readonly issue: PluginIssue;
}

export type AttemptVerdict = Restart | AgentFailure;

const attemptsWord = `${MAX_ATTEMPTS} attempts`;

/** The start of each error is the docs' wording; what follows is the advice of the same bullet. */
const MESSAGES: { readonly [C in FailureCause]: (endings: readonly AttemptEnding[]) => string } = {
  stalled: () =>
    `agent stalled on all ${attemptsWord}: every attempt went the whole window without output; if the agent's work keeps it silent that long, lengthen the window`,
  'lost-reply': () =>
    `agent lost its reply on all ${attemptsWord}: every attempt's response stream went silent and Claude Code gave up waiting on it; lengthening the stall window does not help, CLAUDE_STREAM_IDLE_TIMEOUT_MS sets the streaming idle watchdog's timeout`,
  abandoned: (endings) =>
    `agent abandoned after ${attemptsWord}: ${endings.map((ending) => ENDING_WORDS[ending]).join(', ')}`,
};

const sameEnding = (endings: readonly AttemptEnding[]): AttemptEnding | undefined => {
  const [first] = endings;
  return first !== undefined && endings.every((each) => each === first) ? first : undefined;
};

/** Every attempt stalled, every one lost its reply, or they ended in different ways. */
function failureCause(endings: readonly AttemptEnding[]): FailureCause {
  const same = sameEnding(endings);
  return same === 'stalled' || same === 'lost-reply' ? same : 'abandoned';
}

/** The labels of attempt `attempt` (from 1), which follows an attempt that ended as `previous`. */
export function attemptLabels(attempt: number, previous: AttemptEnding | undefined): AttemptLabels {
  if (attempt <= 1 || previous === undefined) return { nameSuffix: '', detail: '' };
  const detail = `attempt ${attempt} (${ENDING_DETAIL[previous]})`;
  return { nameSuffix: ` (retry ${attempt - 1})`, detail };
}

/**
 * What follows an attempt that ended without finishing. `endings` holds how every attempt so far
 * ended, the one just ended last. Up to the fifth attempt the agent starts over; when the sixth ends the
 * same way the `agent()` call fails.
 */
export function afterAttempt(endings: readonly AttemptEnding[]): AttemptVerdict {
  if (endings.length < MAX_ATTEMPTS) {
    const attempt = endings.length + 1;
    return { restart: true, attempt, labels: attemptLabels(attempt, endings.at(-1)) };
  }
  const cause = failureCause(endings.slice(0, MAX_ATTEMPTS));
  return {
    restart: false,
    cause,
    issue: error('agent', MESSAGES[cause](endings.slice(0, MAX_ATTEMPTS))),
  };
}

/** Whether a restart asked for on attempt `attempt` is allowed: it counts toward the five. */
export const canRestartOnRequest = (attempt: number): boolean => attempt < MAX_ATTEMPTS;

/** "Pass `stallMs` in milliseconds on its `agent()` call", else the environment variable, else the default (env-vars.md). */
export const DEFAULT_STALL_MS = 600_000;
export const STALL_ENV = 'CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS';

const positiveInteger = (text: string | undefined): number | undefined =>
  text !== undefined && /^\d+$/.test(text) && Number(text) > 0 ? Number(text) : undefined;

export interface StallWindowInput {
  /** `stallMs` passed on this agent's `agent()` call. */
  readonly stallMs?: number | undefined;
  readonly env: Readonly<Record<string, string | undefined>>;
}

/**
 * How long Claude Code waits for output from an agent before it ends the attempt: the call's own
 * `stallMs`, else `CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS`, else 10 minutes. A value that is not a
 * positive whole number is no value (judgment).
 */
export function stallWindowMs(input: StallWindowInput): number {
  const own = input.stallMs !== undefined && Number.isInteger(input.stallMs) && input.stallMs > 0;
  return (
    (own ? input.stallMs : undefined) ?? positiveInteger(input.env[STALL_ENV]) ?? DEFAULT_STALL_MS
  );
}

export interface SilenceInput {
  /** Milliseconds since the agent's last output. */
  readonly sinceOutputMs: number;
  /** Of those, the time spent waiting on its own tool calls. */
  readonly toolWaitMs: number;
  /** Of those, the time spent waiting for a usage-limit reset. */
  readonly usageLimitWaitMs: number;
  readonly windowMs: number;
}

/** "Time the agent spends waiting on its own tool calls or on a usage-limit reset doesn't count toward the stall window." */
export function hasStalled(input: SilenceInput): boolean {
  const silent = input.sinceOutputMs - input.toolWaitMs - input.usageLimitWaitMs;
  return silent >= input.windowMs;
}

/** Where an `agent()` call sits in the script. */
export const CALL_SITES = ['parallel', 'pipeline', 'awaited'] as const;
export type CallSite = (typeof CALL_SITES)[number];

export type AfterFailure =
  | { readonly runContinues: true; readonly result: null }
  | { readonly runContinues: false; readonly error: PluginIssue };

const SITE_CONTINUES: { readonly [S in CallSite]: boolean } = {
  parallel: true,
  pipeline: true,
  awaited: false,
};

/**
 * Whether the run goes on after an `agent()` call failed: "Inside `parallel()` or `pipeline()`: the
 * run carries on with `null` in place of the agent's result. Awaited directly: the run ends with the
 * error."
 */
export function afterAgentFailure(site: CallSite, failure: AgentFailure): AfterFailure {
  return SITE_CONTINUES[site]
    ? { runContinues: true, result: null }
    : { runContinues: false, error: failure.issue };
}
