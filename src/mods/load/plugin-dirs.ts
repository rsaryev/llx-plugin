import { MOD_SETTINGS } from '../../protocol/mods-settings.ts';
import { sideloadVerdict, type SideloadVerdict } from '../../settings/managed/index.ts';
import { createPolicyView } from '../../settings/view.ts';
import type { ModsPolicyInput } from './policy-input.ts';

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
 * The directories `CLAUDE_CODE_PLUGIN_DIRS` names: the variable is read from the process environment,
 * else from `env` in `~/.claude/settings.json` (its homes in `MOD_SETTINGS`).
 */
function variableDirs(policy: ModsPolicyInput): readonly string[] {
  const homes: readonly string[] = MOD_SETTINGS.CLAUDE_CODE_PLUGIN_DIRS.homes;
  const fromEnvironment = homes.includes('environment')
    ? policy.env.CLAUDE_CODE_PLUGIN_DIRS
    : undefined;
  const fromSettings = homes.includes('user-env')
    ? policy.user.env?.CLAUDE_CODE_PLUGIN_DIRS
    : undefined;
  return parsePluginDirs(fromEnvironment ?? fromSettings, policy.platform);
}

/**
 * What managed `disableSideloadFlags` does with the session's flags and the variable: the one verdict
 * of `settings/managed/sideload.ts`, read from the managed file of the policy (which alone carries
 * the key, `MOD_SETTINGS`).
 */
function verdictOf(policy: ModsPolicyInput): SideloadVerdict {
  const view = createPolicyView([{ scope: 'managed', settings: policy.managed ?? {} }]);
  return sideloadVerdict(view, {
    pluginDirs: policy.flags.pluginDirs,
    pluginUrls: policy.flags.pluginUrls ?? [],
    agents: policy.flags.agents ?? false,
    mcpServers: policy.flags.mcpServers ?? [],
    pluginDirsVariable: variableDirs(policy),
    cloud: policy.cloud ?? false,
  });
}

/**
 * Every directory the session loads "as `--plugin-dir` does": the flags, then the variable. A
 * directory named twice loads once. When managed `disableSideloadFlags` makes startup exit
 * (`sideloadRefusal`), nothing loads.
 */
export function pluginDirsOf(policy: ModsPolicyInput): readonly string[] {
  if (verdictOf(policy).refusals.length > 0) return [];
  return [...new Set([...policy.flags.pluginDirs, ...variableDirs(policy)])];
}

/**
 * The error startup exits with when managed `disableSideloadFlags` is set and a plugin, agent or MCP
 * server was sideloaded by flag, or `CLAUDE_CODE_PLUGIN_DIRS` names a plugin folder: one line per
 * rejected flag or variable, from `sideloadVerdict`. `--plugin-dir` has the documented message
 * (admin.md, "Test what users see"); the others are judgments recorded beside it.
 */
export function sideloadRefusal(policy: ModsPolicyInput): string | undefined {
  const { refusals } = verdictOf(policy);
  return refusals.length === 0 ? undefined : refusals.join('\n');
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
