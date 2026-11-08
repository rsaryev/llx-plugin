import type { UserConfigValue } from '../loading/resolve/user-config.ts';
import {
  unsetKeys,
  withValues,
  checkGiven,
  type ConfigProblem,
  type DeclaredOptions,
} from './user-config-input.ts';
import { usageError, type UsageError } from './result.ts';
import type { SavedValues } from './configure-plan.ts';

/**
 * `plugin install --config <key=value>` (plugins/cli-reference.md, "plugin install"; plugins/
 * troubleshooting.md, "The `userConfig` dialog never appears"; plugins/components.md, "Include a
 * packaged MCPB server"): each flag sets "a `userConfig` option the plugin's manifest declares";
 * "A key written `<server>.<key>` sets a setting that a bundled MCP server declares in its own
 * `user_config` instead". The install "never prompts": a key the manifest doesn't declare still
 * installs the plugin and prints `⚠ Installed, but --config not applied: ...`; options left unset
 * print `N userConfig options not yet set — run /plugin configure <id> in Claude Code, or pass
 * --config KEY=VALUE.` with `(M required)` after `not yet set` when one is required. Values are
 * checked like `plugin configure`'s (`checkGiven`). A value that fails the check refuses the
 * install (judgment): the docs name the refusal for `configure` only. A key given twice keeps its
 * last value.
 */

/** The `userConfig` of the plugin and of each bundled MCP server (by server name). */
export interface InstallOptions {
  readonly declared: DeclaredOptions;
  readonly bundledServers?: Readonly<Record<string, DeclaredOptions>>;
  /**
   * Bundled MCP servers whose bundle the manifest references by URL: "isn't read at install time, so
   * its keys aren't listed". Their keys are not known keys, and the message says to configure them in `/plugin`.
   */
  readonly unreadServers?: readonly string[];
}

/** The `--config` flags as `key` → `value`; a flag with no `=` is a usage error. */
export function parseConfigFlags(
  flags: readonly string[],
): { readonly given: Readonly<Record<string, string>> } | UsageError {
  const given: Record<string, string> = {};
  for (const flag of flags) {
    const at = flag.indexOf('=');
    if (at <= 0) return usageError(`--config expects key=value, got "${flag}"`);
    given[flag.slice(0, at)] = flag.slice(at + 1);
  }
  return { given };
}

/** Every key a `--config` can name: the plugin's options and `<server>.<key>` for each bundled server's. */
export function knownKeys(options: InstallOptions): DeclaredOptions {
  const bundled = Object.entries(options.bundledServers ?? {}).flatMap(([server, declared]) =>
    Object.entries(declared).map(([key, option]) => [`${server}.${key}`, option] as const),
  );
  return { ...options.declared, ...Object.fromEntries(bundled) };
}

export interface ConfigOutcome {
  /** Failing values: the install is refused. */
  readonly refused: readonly ConfigProblem[];
  /** Keys that name no option: the install goes ahead and says they were not applied. */
  readonly notApplied: readonly ConfigProblem[];
  /** What to store: the plugin's own options, and each bundled server's by server name. */
  readonly plugin: SavedValues;
  readonly servers: Readonly<Record<string, Readonly<Record<string, UserConfigValue>>>>;
  /** The plugin's own options still unset after the install. */
  readonly unset: readonly string[];
  readonly unsetRequired: number;
}

const EMPTY: SavedValues = { settings: {}, secrets: {} };

function splitSaved(
  accepted: Readonly<Record<string, UserConfigValue>>,
  declared: DeclaredOptions,
): SavedValues {
  const settings: Record<string, UserConfigValue> = {};
  const secrets: Record<string, UserConfigValue> = {};
  for (const [key, value] of Object.entries(accepted)) {
    (declared[key]?.sensitive === true ? secrets : settings)[key] = value;
  }
  return { settings, secrets };
}

function serversOf(
  accepted: Readonly<Record<string, UserConfigValue>>,
  options: InstallOptions,
): Record<string, Record<string, UserConfigValue>> {
  const servers: Record<string, Record<string, UserConfigValue>> = {};
  for (const server of Object.keys(options.bundledServers ?? {})) {
    for (const [key, value] of Object.entries(accepted)) {
      if (key.startsWith(`${server}.`))
        (servers[server] ??= {})[key.slice(server.length + 1)] = value;
    }
  }
  return servers;
}

/** What the `--config` values do to an install. */
export function applyConfig(
  given: Readonly<Record<string, string>>,
  options: InstallOptions,
): ConfigOutcome {
  const checked = checkGiven(knownKeys(options), given);
  const own = Object.fromEntries(
    Object.entries(checked.accepted).filter(([key]) => Object.hasOwn(options.declared, key)),
  );
  const after = withValues({ declared: options.declared, values: {} }, own);
  const unset = unsetKeys(after);
  return {
    refused: checked.problems.filter((problem) => !problem.undeclared),
    notApplied: checked.problems.filter((problem) => problem.undeclared),
    plugin: Object.keys(own).length === 0 ? EMPTY : splitSaved(own, options.declared),
    servers: serversOf(checked.accepted, options),
    unset,
    unsetRequired: unset.filter((key) => options.declared[key]?.required === true).length,
  };
}

/** `N userConfig options not yet set (M required) — run /plugin configure <id> in Claude Code, or pass --config KEY=VALUE.` */
export function notYetSetLine(id: string, outcome: ConfigOutcome): string | undefined {
  if (outcome.unset.length === 0) return undefined;
  const required = outcome.unsetRequired > 0 ? ` (${outcome.unsetRequired} required)` : '';
  return `${outcome.unset.length} userConfig options not yet set${required} — run /plugin configure ${id} in Claude Code, or pass --config KEY=VALUE.`;
}

/**
 * One `⚠ Installed, but --config not applied` line per key that names no option, each followed by the
 * keys that do exist. A bundle the manifest references by URL adds `Configure "<server>" in /plugin` (judgment: the
 * docs say only that "the message says to configure it in `/plugin`").
 */
export function notAppliedLines(
  outcome: ConfigOutcome,
  options: InstallOptions,
): readonly string[] {
  const unread = options.unreadServers ?? [];
  const bundled = Object.keys(options.bundledServers ?? {}).length > 0 || unread.length > 0;
  const where = bundled
    ? "this plugin's userConfig or by its bundled MCP servers"
    : "this plugin's userConfig";
  const keys = Object.keys(knownKeys(options));
  const known = keys.length === 0 ? 'none' : keys.join(', ');
  const configure = unread.map(
    (server) => `. Configure "${server}" in /plugin: its bundle is not read at install time`,
  );
  return outcome.notApplied.map(
    (problem) =>
      `⚠ Installed, but --config not applied: --config key "${problem.key}" isn't declared in ${where}. Declared keys: ${known}${configure.join('')}`,
  );
}
