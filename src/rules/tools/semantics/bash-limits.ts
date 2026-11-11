import type { Environment } from '../../../ports/environment.ts';
import { positiveInteger } from './env-number.ts';

/** tools-reference.md, "Timeout and output limits" and env-vars.md: milliseconds. */
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 600_000;
const BACKGROUND_DEFAULT_MS = 1_800_000;
const BACKGROUND_PRINT_DEFAULT_MS = 600_000;
const BACKGROUND_MAX_MS = 7_200_000;

const configured = (env: Pick<Environment, 'get'>) => ({
  defaultMs: positiveInteger(env, 'BASH_DEFAULT_TIMEOUT_MS'),
  maxMs: positiveInteger(env, 'BASH_MAX_TIMEOUT_MS'),
});

/** What a foreground command may run for: the default, and the ceiling over whatever Claude asks. */
function foregroundLimits(env: Pick<Environment, 'get'>): { fallback: number; ceiling: number } {
  const { defaultMs, maxMs } = configured(env);
  const fallback = defaultMs ?? DEFAULT_TIMEOUT_MS;
  return { fallback, ceiling: Math.max(maxMs ?? MAX_TIMEOUT_MS, fallback) };
}

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * How long a foreground Bash or PowerShell command runs (tools-reference.md, "Timeout and output
 * limits"; hooks.md: "Values above the maximum are reduced to the maximum rather than rejected").
 * `BASH_DEFAULT_TIMEOUT_MS` is the default when Claude passes no timeout, two minutes out of the
 * box; `BASH_MAX_TIMEOUT_MS` sets the ceiling, ten minutes out of the box, and the effective ceiling
 * is the larger of the two. A timeout that is not a positive number counts as none, as does a
 * variable that is not a positive integer (spec/judgments.md).
 */
export function effectiveBashTimeout(requested: unknown, env: Pick<Environment, 'get'>): number {
  const { fallback, ceiling } = foregroundLimits(env);
  return isPositiveNumber(requested) ? Math.min(requested, ceiling) : fallback;
}

/** What the session is, as far as the background time limit goes. */
export interface BackgroundSession {
  /** A run with `-p`, an Agent SDK application, a CI job or a cloud session; a local session has no limit. */
  readonly unattended: boolean;
  /** A `-p` run whose prompt is text, not `--input-format stream-json`: its defaults are 10 minutes. */
  readonly printWithTextPrompt: boolean;
}

export interface BackgroundRequest {
  readonly session: BackgroundSession;
  readonly env: Pick<Environment, 'get'>;
  /** The `timeout` Claude passed with `run_in_background`. */
  readonly timeout?: number;
  /** A foreground command that reached its timeout and moved to the background. */
  readonly moved?: boolean;
}

/**
 * How long a background command may run, or `undefined` for none (tools-reference.md, "Time limit
 * for background commands"). A command Claude starts in the background gets 30 minutes, or its
 * `timeout` up to 2 hours; one that moves from the foreground gets 30 minutes from the move.
 * `BASH_DEFAULT_TIMEOUT_MS` above the default replaces it (a lower value never shortens it), and an
 * effective ceiling above 2 hours raises the maximum.
 */
export function backgroundTimeLimit(request: BackgroundRequest): number | undefined {
  const { session, env, timeout, moved } = request;
  if (!session.unattended) return undefined;
  const base = session.printWithTextPrompt ? BACKGROUND_PRINT_DEFAULT_MS : BACKGROUND_DEFAULT_MS;
  const { defaultMs, maxMs } = configured(env);
  const limit = Math.max(base, defaultMs ?? 0);
  const maximum = Math.max(BACKGROUND_MAX_MS, defaultMs ?? 0, maxMs ?? 0);
  return moved === true || !isPositiveNumber(timeout) ? limit : Math.min(timeout, maximum);
}
