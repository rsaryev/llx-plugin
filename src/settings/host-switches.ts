import type { Environment } from '../ports/environment.ts';

/**
 * The host-wide environment variables that switch a feature on or off or bound it (env-vars.md,
 * "Variables"), read through the `Environment` port (L3). Each function is the decision the table row
 * describes; the host applies it.
 */

const text = (env: Environment, name: string): string => (env.get(name) ?? '').trim();
const isOne = (env: Environment, name: string): boolean => text(env, name) === '1';

/** `CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL=1`: "skips the registration permanently". */
export const officialMarketplaceAutoinstallEnabled = (env: Environment): boolean =>
  !isOne(env, 'CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL');

/**
 * `CLAUDE_CODE_DISABLE_PERMISSION_PROMPT_NOTIFY_HOOKS=1` stops `Notification` hooks for unanswered
 * permission requests "in sessions where Claude Code sends them to the Agent SDK's `canUseTool`
 * callback"; "has no effect in terminal sessions".
 */
export const permissionPromptNotifyHooksEnabled = (
  env: Environment,
  session: { readonly usesCanUseTool: boolean },
): boolean =>
  !(session.usesCanUseTool && isOne(env, 'CLAUDE_CODE_DISABLE_PERMISSION_PROMPT_NOTIFY_HOOKS'));

/** `CLAUDE_CODE_DISABLE_POLICY_SKILLS=1`: skip "the system-wide managed skills directory". */
export const policySkillsEnabled = (env: Environment): boolean =>
  !isOne(env, 'CLAUDE_CODE_DISABLE_POLICY_SKILLS');

/**
 * `CLAUDE_CODE_ENABLE_BACKGROUND_PLUGIN_REFRESH=1` refreshes plugin state at turn boundaries "in
 * non-interactive mode"; off by default.
 */
export const backgroundPluginRefreshEnabled = (
  env: Environment,
  session: { readonly interactive: boolean },
): boolean => !session.interactive && isOne(env, 'CLAUDE_CODE_ENABLE_BACKGROUND_PLUGIN_REFRESH');

/** "Accepts a positive whole number in plain digits; anything else is ignored" (default 20). */
export const DEFAULT_MAX_CONCURRENT_SUBAGENTS = 20;
export function maxConcurrentSubagents(env: Environment): number {
  const value = text(env, 'CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS');
  const number = /^[0-9]+$/.test(value) ? Number(value) : 0;
  return number > 0 && Number.isSafeInteger(number) ? number : DEFAULT_MAX_CONCURRENT_SUBAGENTS;
}

/**
 * `CLAUDE_CODE_PLUGIN_GIT_TIMEOUT_MS`: "Timeout in milliseconds for cloning or refreshing a plugin
 * marketplace (default: 120000)". Judgment (spec/judgments.md): a value that is not a positive whole
 * number leaves the default.
 */
export const DEFAULT_PLUGIN_GIT_TIMEOUT_MS = 120_000;
export function pluginGitTimeoutMs(env: Environment): number {
  const value = text(env, 'CLAUDE_CODE_PLUGIN_GIT_TIMEOUT_MS');
  const number = /^[0-9]+$/.test(value) ? Number(value) : 0;
  return number > 0 && Number.isSafeInteger(number) ? number : DEFAULT_PLUGIN_GIT_TIMEOUT_MS;
}

/** `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1`: clone GitHub `owner/repo` shorthand over HTTPS, not SSH. */
export const preferHttps = (env: Environment): boolean =>
  isOne(env, 'CLAUDE_CODE_PLUGIN_PREFER_HTTPS');

/** The wait before the first query in a non-interactive run. */
export interface SyncInstallWait {
  readonly wait: boolean;
  /** No default: without the timeout variable, "synchronous installation waits until complete". */
  readonly timeoutMs?: number;
}

/**
 * `CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1` in non-interactive mode waits for installation;
 * `CLAUDE_CODE_SYNC_PLUGIN_INSTALL_TIMEOUT_MS` bounds the wait. Judgment: an invalid timeout is no bound.
 */
export function syncPluginInstall(
  env: Environment,
  session: { readonly interactive: boolean },
): SyncInstallWait {
  if (session.interactive || !isOne(env, 'CLAUDE_CODE_SYNC_PLUGIN_INSTALL')) return { wait: false };
  const value = text(env, 'CLAUDE_CODE_SYNC_PLUGIN_INSTALL_TIMEOUT_MS');
  const number = /^[0-9]+$/.test(value) ? Number(value) : 0;
  return number > 0 ? { wait: true, timeoutMs: number } : { wait: true };
}

/**
 * Whether telemetry is off. `DISABLE_TELEMETRY`: "any non-empty value ... Setting it to `0` or
 * `false` still opts out". `DO_NOT_TRACK` is "a standard boolean, so `0` leaves telemetry on".
 */
export function telemetryOptedOut(env: Environment): boolean {
  if ((env.get('DISABLE_TELEMETRY') ?? '') !== '') return true;
  return ['1', 'true'].includes(text(env, 'DO_NOT_TRACK').toLowerCase());
}

/**
 * `CLAUDE_CODE_PLUGIN_SEED_DIR`: "one or more read-only plugin seed directories, separated by `:` on
 * Unix or `;` on Windows"; "Claude Code uses the first seed that contains a given marketplace or
 * plugin cache", so the order is kept. Empty entries are dropped (judgment).
 */
export function pluginSeedDirectories(
  env: Environment,
  platform: 'posix' | 'windows',
): readonly string[] {
  const separator = platform === 'windows' ? ';' : ':';
  return text(env, 'CLAUDE_CODE_PLUGIN_SEED_DIR')
    .split(separator)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

/**
 * `CLAUDE_CODE_TMPDIR`: "Claude Code appends `/claude-{uid}/` to this path on Unix, or `/claude/` on
 * Windows". Without the override the host's default stands ("`/tmp` on macOS, `os.tmpdir()` on Linux
 * and Windows"), which the host passes as `fallback`. The uid is the host's.
 */
export function claudeTempDirectory(
  env: Environment,
  input: {
    readonly platform: 'posix' | 'windows';
    readonly uid: number;
    readonly fallback: string;
  },
): string {
  const base = (text(env, 'CLAUDE_CODE_TMPDIR') || input.fallback).replace(/[\\/]+$/, '');
  return input.platform === 'windows' ? `${base}/claude/` : `${base}/claude-${input.uid}/`;
}
