/**
 * `/reload-plugins` (plugins/cli-reference.md, "/reload-plugins", "Reload summary", "Reloads that
 * change MCP tools", "Sessions without an interactive terminal"; plugins/troubleshooting.md, `Run
 * /reload-plugins to apply.`): the one line it prints, whether the reload is applied or refused,
 * and who may run it. Pure texts and decisions over counts the host measured.
 *
 * Judgments (spec/judgments.md): the clauses are joined to the counts by a space, dependencies
 * before errors, with no pluralization (the docs write `N plugins`, `N errors`); several servers
 * are listed in the order added, then removed, joined by `, `; when a reload changes both an MCP
 * server and the `LSP` tool the line names the MCP servers.
 */

export interface ReloadCounts {
  readonly plugins: number;
  /** `skillCount` of every plugin's skills. */
  readonly skills: number;
  /** The agents loaded in the session, "including ones that don't come from plugins". */
  readonly agents: number;
  readonly hooks: number;
  readonly mcpServers: number;
  readonly lspServers: number;
  /** Plugins that failed to load. */
  readonly errors: number;
  /** Plugin dependencies this reload installed because they were missing. */
  readonly resolvedDependencies?: readonly string[];
}

/** "The skills count covers every skill a plugin provides, both its `commands/` entries and its `SKILL.md` skills." */
export const skillCount = (plugin: {
  readonly commands: number;
  readonly skillFiles: number;
}): number => plugin.commands + plugin.skillFiles;

export function reloadSummary(
  counts: ReloadCounts,
  session: { readonly interactive: boolean },
): string {
  const parts = [
    `${counts.plugins} plugins`,
    `${counts.skills} skills`,
    `${counts.agents} agents`,
    `${counts.hooks} hooks`,
    ...(session.interactive ? [`${counts.mcpServers} plugin MCP servers`] : []),
    `${counts.lspServers} plugin LSP servers`,
  ];
  const resolved = counts.resolvedDependencies ?? [];
  const dependencies =
    resolved.length === 0
      ? []
      : [`(+ ${resolved.length} dependencies: ${resolved.join(', ')}) resolved`];
  const errors =
    counts.errors > 0 ? [`${counts.errors} errors during load. Run /plugin for details.`] : [];
  return [`Reloaded: ${parts.join(' · ')}`, ...dependencies, ...errors].join(' ');
}

// ---- the prompt cache ----

export interface ReloadChange {
  readonly addedMcp: readonly string[];
  readonly removedMcp: readonly string[];
  /** The reload adds or removes the `LSP` tool. */
  readonly lsp: 'adds' | 'removes' | 'unchanged';
  /** The change would invalidate the prompt cache. */
  readonly invalidatesPromptCache: boolean;
}

export type ReloadGate =
  | { readonly apply: true; readonly mcpDeferred: boolean }
  | { readonly apply: false; readonly message: string };

const RE_READ =
  ' — your next message will re-read the whole conversation instead of using the cache. Run /reload-plugins --force to apply.';

const LSP_LINE: { readonly [L in 'adds' | 'removes']: string } = {
  adds: 'This reload adds the LSP tool',
  removes: 'This reload removes the LSP tool',
};

function refusal(change: ReloadChange): string | undefined {
  const servers = [...change.addedMcp, ...change.removedMcp];
  if (servers.length > 0) return `This reload changes MCP tools (${servers.join(', ')})${RE_READ}`;
  return change.lsp === 'unchanged' ? undefined : `${LSP_LINE[change.lsp]}${RE_READ}`;
}

/**
 * "When the reload would add or remove a plugin MCP server or the `LSP` tool, and that change would
 * invalidate the prompt cache, Claude Code doesn't apply the reload" and prints `This reload changes
 * MCP tools (<server>) — your next message will re-read the whole conversation instead of using the
 * cache. Run /reload-plugins --force to apply.`; `--force` applies it anyway. Without an
 * interactive terminal "the reload doesn't connect or disconnect plugin MCP servers. Those changes
 * take effect in your next session", so it is applied with the servers deferred.
 */
export function reloadGate(
  change: ReloadChange,
  options: { readonly force: boolean; readonly interactive: boolean },
): ReloadGate {
  if (!options.interactive) return { apply: true, mcpDeferred: true };
  const message = change.invalidatesPromptCache && !options.force ? refusal(change) : undefined;
  return message === undefined ? { apply: true, mcpDeferred: false } : { apply: false, message };
}

/** `/reload-plugins [--force]`; "`force` without dashes works too". */
export function parseReloadArguments(text: string): { readonly force: boolean } {
  return { force: text.trim() === '--force' || text.trim() === 'force' };
}

const REMOTE_REPLY = "/reload-plugins isn't available over a remote connection in this session.";

/**
 * In a session without an interactive terminal the command runs "only when you type it into the
 * session yourself"; when it arrives another way it replies and reloads nothing. An interactive
 * terminal runs it whichever way it arrives (the docs restrict only the other sessions).
 */
export function reloadAllowed(session: {
  readonly interactive: boolean;
  readonly typedByUser: boolean;
}): { readonly allowed: true } | { readonly allowed: false; readonly reply: string } {
  return session.interactive || session.typedByUser
    ? { allowed: true }
    : { allowed: false, reply: REMOTE_REPLY };
}
