import { scrubAction, withoutUserinfo, type ScrubAction } from '../../format/credential-env.ts';

/**
 * `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` (env-vars.md, "Variables" and "What the subprocess environment
 * scrub removes"): with it on, "Claude Code removes credentials from the environments of the
 * subprocesses it starts, such as Bash commands, hooks, and stdio MCP servers" and keeps them for
 * its own API calls. The table (`format/credential-env`, `scrubAction`) decides per variable; this
 * file applies it to a snapshot, pure.
 *
 * Host duties the kit cannot do (L3): on Linux the scrub "also runs Bash subprocesses in an isolated
 * PID namespace so they can't read host process environments through `/proc`" (a process option,
 * not an environment edit), and `claude-code-action` sets the variable itself when
 * `allowed_non_write_users` is configured.
 */

/** The switch's own name: the one variable the scrub reads. */
const SWITCH = 'CLAUDE_CODE_SUBPROCESS_ENV_SCRUB';

/** "For variables that turn a behavior on or off, set `1`, `true`, `yes`, or `on` ... in any casing." */
const ON_SPELLINGS: ReadonlySet<string> = new Set(['1', 'true', 'yes', 'on']);

/** Whether the snapshot turns the scrub on. */
export const subprocessScrubEnabled = (snapshot: Readonly<Record<string, string>>): boolean =>
  ON_SPELLINGS.has((snapshot[SWITCH] ?? '').toLowerCase());

/** The value a variable has after an action; `undefined` removes it. */
const APPLY: { readonly [A in ScrubAction]: (value: string) => string | undefined } = {
  remove: () => undefined,
  keep: (value) => value,
  'cut-userinfo': withoutUserinfo,
};

/** "Before v2.1.251, the scrub removed `ANTHROPIC_API_KEY` and `AWS_SECRET_ACCESS_KEY` and left the table's other example variables unchanged." */
const LEGACY_REMOVED: ReadonlySet<string> = new Set(['ANTHROPIC_API_KEY', 'AWS_SECRET_ACCESS_KEY']);
const TABLE_SINCE = [2, 1, 251] as const;

type Scrubber = (name: string, value: string) => string | undefined;

const SCRUBBERS: { readonly [K in 'legacy' | 'table']: Scrubber } = {
  legacy: (name, value) => (LEGACY_REMOVED.has(name) ? undefined : value),
  table: (name, value) => APPLY[scrubAction(name, value)](value),
};

/** Whether the numbers `own` sort before `than`, left to right. */
function sortsBefore(own: readonly number[], than: readonly number[]): boolean {
  const differs = than.findIndex((part, at) => own[at] !== part);
  return differs !== -1 && (own[differs] ?? 0) < (than[differs] ?? 0);
}

/** The table applies from `2.1.251` on; a version the kit cannot read is the current table (judgment). */
function scrubberFor(version: string): Scrubber {
  const parts = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version)?.slice(1).map(Number);
  return parts !== undefined && sortsBefore(parts, TABLE_SINCE)
    ? SCRUBBERS.legacy
    : SCRUBBERS.table;
}

export interface ScrubOptions {
  /** The Claude Code release whose behaviour to follow, such as `2.1.319`; absent is the current table. */
  readonly version?: string;
}

/**
 * The environment a subprocess gets: `snapshot` with the credentials the scrub removes taken out and
 * the userinfo cut from registry URLs, when `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` is on; the snapshot
 * unchanged (a copy) when it is not. A secret whose name and value look like no credential stays:
 * "use it as one layer alongside narrow permission rules".
 */
export function scrubEnvironment(
  snapshot: Readonly<Record<string, string>>,
  options: ScrubOptions = {},
): Record<string, string> {
  if (!subprocessScrubEnabled(snapshot)) return { ...snapshot };
  const scrubber = options.version === undefined ? SCRUBBERS.table : scrubberFor(options.version);
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(snapshot)) {
    const kept = scrubber(name, value);
    if (kept !== undefined) out[name] = kept;
  }
  return out;
}
