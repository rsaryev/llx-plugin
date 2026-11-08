import { MOD_SETTINGS } from '../../protocol/mods-settings.ts';
import type { ModsPolicyInput } from './policy-input.ts';
import { flagSetting } from './policy-input.ts';

/**
 * Plugin directories loaded for a session (plugins/mods/reference.md, "Settings and environment
 * variables" and "Commands"): `--plugin-dir`, `CLAUDE_CODE_PLUGIN_DIRS` and
 * `CLAUDE_CODE_PLUGIN_DIR_WATCH`.
 */

const SEPARATOR = { posix: ':', windows: ';' } as const;

/** `CLAUDE_CODE_PLUGIN_DIRS`: "Absolute paths separated by `:`, or `;` on Windows". An empty piece is left out. */
export function parsePluginDirs(
  value: string | undefined,
  platform: 'posix' | 'windows',
): readonly string[] {
  if (value === undefined) return [];
  return value
    .split(SEPARATOR[platform])
    .map((piece) => piece.trim())
    .filter((piece) => piece !== '');
}

/**
 * Every directory the session loads "as `--plugin-dir` does": the flags, then the variable. The
 * variable is read from the process environment, else from `env` in `~/.claude/settings.json` (its
 * homes in `MOD_SETTINGS`). A directory named twice loads once. Judgment: managed
 * `disableSideloadFlags` also keeps the directories of the variable from loading (they load "as
 * `--plugin-dir` does"), though only a flag makes startup exit.
 */
export function pluginDirsOf(policy: ModsPolicyInput): readonly string[] {
  if (flagSetting(policy.managed, 'disableSideloadFlags')) return [];
  const homes: readonly string[] = MOD_SETTINGS.CLAUDE_CODE_PLUGIN_DIRS.homes;
  const fromEnvironment = homes.includes('environment')
    ? policy.env.CLAUDE_CODE_PLUGIN_DIRS
    : undefined;
  const fromSettings = homes.includes('user-env')
    ? policy.user.env?.CLAUDE_CODE_PLUGIN_DIRS
    : undefined;
  const listed = parsePluginDirs(fromEnvironment ?? fromSettings, policy.platform);
  return [...new Set([...policy.flags.pluginDirs, ...listed])];
}

/**
 * The refusal at startup when managed `disableSideloadFlags` is set and a plugin was named by flag:
 * `--plugin-dir` has the documented message (admin.md, "Test what users see"); `--plugin-url` has the
 * same, naming its own flag (judgment).
 */
export function sideloadRefusal(policy: ModsPolicyInput): string | undefined {
  if (!flagSetting(policy.managed, 'disableSideloadFlags')) return undefined;
  const flags = [
    { name: '--plugin-dir', given: policy.flags.pluginDirs },
    { name: '--plugin-url', given: policy.flags.pluginUrls ?? [] },
  ];
  const named = flags.find((flag) => flag.given.length > 0);
  return named === undefined
    ? undefined
    : `${named.name} is disabled by your organization's managed settings (disableSideloadFlags)`;
}

/**
 * Whether a session reloads `--plugin-dir` mods when a file changes: "Claude Code watches a
 * directory loaded with `--plugin-dir`" in an interactive session, and `1` makes "a long-running
 * non-interactive session" do the same.
 */
export function watchesPluginDirs(policy: ModsPolicyInput, isInteractive: boolean): boolean {
  if (isInteractive) return true;
  return policy.env.CLAUDE_CODE_PLUGIN_DIR_WATCH === '1';
}
