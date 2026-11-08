import type { Environment } from '../../../ports/environment.ts';
import { positiveInteger, wholeNumber } from './env-number.ts';

/** tools-reference.md, "WebFetch tool behavior": "caches each response for 15 minutes by default". */
const DEFAULT_CACHE_TTL_MS = 900_000;
/** "A page that hasn't finished downloading within five minutes ... fails with a deadline error." */
const DEFAULT_DEADLINE_MS = 300_000;

export interface FetchTimings {
  /** How long a fetched URL's response stays cached. */
  readonly cacheTtlMs: number;
  /** How long a download may take, redirects included; `undefined` when `0` removed the limit. */
  readonly deadlineMs: number | undefined;
}

/**
 * The cache time and the download deadline of WebFetch (tools-reference.md, "WebFetch tool
 * behavior"; env-vars.md). `CLAUDE_CODE_WEBFETCH_CACHE_TTL_MS` "takes plain digits only; `0`, a
 * decimal, or any other spelling keeps the default". `CLAUDE_CODE_WEBFETCH_DEADLINE_MS` takes plain
 * digits, `0` removes the limit, and a decimal or any other spelling keeps the default.
 */
export function webFetchTimings(env: Pick<Environment, 'get'>): FetchTimings {
  const deadline = wholeNumber(env, 'CLAUDE_CODE_WEBFETCH_DEADLINE_MS') ?? DEFAULT_DEADLINE_MS;
  return {
    cacheTtlMs: positiveInteger(env, 'CLAUDE_CODE_WEBFETCH_CACHE_TTL_MS') ?? DEFAULT_CACHE_TTL_MS,
    deadlineMs: deadline === 0 ? undefined : deadline,
  };
}

const hostOf = (text: string): string | undefined => {
  try {
    return new URL(text).hostname.toLowerCase();
  } catch {
    return undefined;
  }
};

/**
 * "When a URL redirects to a different host, WebFetch returns a text result that names the original
 * URL and the redirect target instead of following it" (tools-reference.md). `undefined` when the
 * target is on the same host, which is followed. Hosts compare by hostname, ignoring case, port and
 * scheme, and the wording is a judgment (spec/judgments.md).
 */
export function redirectNotice(original: string, target: string): string | undefined {
  const from = hostOf(original);
  const to = hostOf(target);
  if (from === undefined || to === undefined || from === to) return undefined;
  return `The URL ${original} redirects to a different host: ${target}. Fetch the new URL with a second WebFetch call.`;
}
