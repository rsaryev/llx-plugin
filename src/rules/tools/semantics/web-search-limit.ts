import type { Environment } from '../../../ports/environment.ts';
import { positiveInteger, wholeNumber } from './env-number.ts';

/** tools-reference.md, "Session search limit": "a limit of 200 WebSearch calls". */
const DEFAULT_CAP = 200;
/** "refills at about 100 calls per hour" in an interactive terminal session. */
const INTERACTIVE_REFILLS_PER_HOUR = 100;
const HOUR_MS = 3_600_000;

export interface WebSearchSession {
  /** An interactive terminal session; `false` for `-p` and the Agent SDK. */
  readonly interactive: boolean;
}

export interface WebSearchLimits {
  /** The most calls the count may reach. */
  readonly cap: number;
  /** Calls given back per hour. */
  readonly refillPerHour: number;
  /** "In non-interactive mode with `-p` and in the Agent SDK, the limit applies per turn, not per session." */
  readonly perTurn: boolean;
}

/**
 * The limits of WebSearch (tools-reference.md, "Session search limit"; env-vars.md).
 * `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION` "accepts a positive whole number"; anything else is
 * ignored, so the cap "can be raised but not turned off". `CLAUDE_CODE_WEB_SEARCH_REFILLS_PER_HOUR`
 * takes plain digits (`0` included); the default is 100 in an interactive session and 0, no
 * refill, in a non-interactive one. A number below 200 lowers the cap (spec/judgments.md).
 */
export function webSearchLimits(
  env: Pick<Environment, 'get'>,
  session: WebSearchSession,
): WebSearchLimits {
  return {
    cap: positiveInteger(env, 'CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION') ?? DEFAULT_CAP,
    refillPerHour:
      wholeNumber(env, 'CLAUDE_CODE_WEB_SEARCH_REFILLS_PER_HOUR') ??
      (session.interactive ? INTERACTIVE_REFILLS_PER_HOUR : 0),
    perTurn: !session.interactive,
  };
}

export interface WebSearchUsage {
  /** Calls counted so far in the session, or in the turn when the limits are per turn. */
  readonly used: number;
  /** Milliseconds since the count started. */
  readonly elapsedMs: number;
}

/**
 * How many more WebSearch calls are allowed. The count refills at the hourly rate, continuously and
 * rounded down, and never gives back more than was used (spec/judgments.md: the docs say "about 100
 * calls per hour" and no more). At zero a call "did nothing" and Claude is told to carry on.
 */
export function webSearchAllowance(limits: WebSearchLimits, usage: WebSearchUsage): number {
  const refilled = Math.floor((limits.refillPerHour * usage.elapsedMs) / HOUR_MS);
  const counted = Math.max(usage.used - refilled, 0);
  return Math.max(limits.cap - counted, 0);
}
