import type { PluginMcpServer } from '../../format/mcp-config.ts';
import type { McpServerPolicy, McpServerVerdict } from './allow-deny.ts';
import type { McpLoadSettings } from './load-settings.ts';
import type { ManagedMcpFile } from './managed-file.ts';
import type { McpServerOrigin } from './origins.ts';
import { rankMcpServers, type HiddenMcpServer, type McpCandidate, type McpScope } from './scope.ts';
import { applyToggles, type ProjectToggles } from './toggles.ts';

/** `claude mcp add` while `managed-mcp.json` is deployed (managed-mcp.md, "Validate the configuration"). */
export const EXCLUSIVE_ADD_ERROR =
  'Cannot add MCP server: enterprise MCP configuration is active and has exclusive control over MCP servers';

/** The startup exit of `--mcp-config` on a workstation (managed-mcp.md, "Servers passed with --mcp-config"). */
export const MCP_CONFIG_EXIT =
  'You cannot dynamically configure MCP servers when an enterprise MCP config is present';

/**
 * The startup exit of `--strict-mcp-config`. The page says Claude Code "exits at startup" without
 * quoting it (spec/judgments.md).
 */
export const STRICT_MCP_CONFIG_EXIT =
  'You cannot use --strict-mcp-config when an enterprise MCP config is present';

/** The startup exit of `claude --chrome` (managed-mcp.md, "How restrictions appear to users"). */
export const CHROME_BLOCKED_ERROR =
  "Claude in Chrome is blocked by your organization's managed MCP configuration (managed-mcp.json). An administrator can allow it with allowClaudeInChromeWithManagedMcp in device policy.";

/** The name of the built-in Claude in Chrome server, which a `deniedMcpServers` entry can name. */
const CHROME_SERVER_NAME = 'claude-in-chrome';

/** Its endpoint is not documented, so a stand-in matches `serverName` entries only (spec/judgments.md). */
const CHROME_STAND_IN: PluginMcpServer = { command: CHROME_SERVER_NAME };

export interface NamedMcpServer {
  readonly name: string;
  readonly server: PluginMcpServer;
}

export interface McpSessionFacts {
  /** A cloud session: the host delivers connectors and other servers through `--mcp-config`. */
  readonly cloud: boolean;
  /** The servers `--mcp-config` passes (in a cloud session, the ones the cloud host delivers). */
  readonly mcpConfig?: readonly NamedMcpServer[];
  readonly strictMcpConfig?: boolean;
  /** Set only for a user who could run Claude in Chrome: they ran `claude --chrome`, or turned it on by default. */
  readonly chrome?: { readonly flag: boolean; readonly byDefault: boolean };
}

/** A server some scope other than the organization's defines; the plan builds the managed ones itself. */
export type ConfiguredCandidate = McpCandidate & { readonly scope: Exclude<McpScope, 'managed'> };

export interface McpLoadInput {
  /** `readManagedMcpFile(...).file`: undefined when no file is deployed or it cannot be read. */
  readonly managedFile: ManagedMcpFile | undefined;
  /** `readManagedMcpServers(...).servers`. */
  readonly managedServers: readonly McpCandidate[];
  readonly candidates: readonly ConfiguredCandidate[];
  readonly settings: McpLoadSettings;
  readonly policy: McpServerPolicy;
  readonly session: McpSessionFacts;
  /** The project's `/mcp` toggles; a disabled server stays in the plan, marked. */
  readonly toggles?: ProjectToggles | undefined;
}

/** Where a planned server comes from; the two organization sources are told apart for the lists. */
export const PLAN_SOURCES = [
  'managedFile',
  'managedSettings',
  'local',
  'project',
  'user',
  'plugin',
  'connector',
  'flag',
] as const;
export type PlanSource = (typeof PLAN_SOURCES)[number];

export interface PlannedServer extends NamedMcpServer {
  readonly source: PlanSource;
  readonly origin: McpServerOrigin;
  /** `false` when the user turned it off in `/mcp`. */
  readonly enabled: boolean;
}

export type BlockedServer = NamedMcpServer & {
  readonly source: PlanSource;
} & Extract<McpServerVerdict, { readonly allowed: false }>;

export interface McpLoadPlan {
  /** Why Claude Code exits at startup, or `undefined` when the session starts. */
  readonly exit: string | undefined;
  /** A readable `managed-mcp.json` is deployed. */
  readonly exclusive: boolean;
  /** What loads, highest scope first (servers of `--mcp-config` last). */
  readonly servers: readonly PlannedServer[];
  /** What `allowedMcpServers` and `deniedMcpServers` stop. */
  readonly blocked: readonly BlockedServer[];
  /** What a server above displaced. */
  readonly hidden: readonly HiddenMcpServer[];
  /** The servers a cloud host delivered that exclusive control skipped. */
  readonly skipped: readonly string[];
  /** What Claude Code writes to stderr. */
  readonly warnings: readonly string[];
  /** What `claude mcp add` says while the file is deployed. */
  readonly addError: string | undefined;
  /** The built-in Claude in Chrome server runs. */
  readonly chrome: boolean;
}

const ORIGIN_OF: { readonly [S in PlanSource]: McpServerOrigin } = {
  managedFile: 'managedFile',
  managedSettings: 'managedSettings',
  local: 'configured',
  project: 'configured',
  user: 'configured',
  plugin: 'configured',
  connector: 'configured',
  flag: 'configured',
};

/** What decides whether a scope's servers load. */
interface Gate {
  readonly exclusive: boolean;
  readonly pluginOnlyMcp: boolean;
  readonly connectors: boolean;
}

const OPEN = (gate: Gate): boolean => !gate.exclusive && !gate.pluginOnlyMcp;

/**
 * Exclusive control "includes plugin-provided servers" in what users cannot use; the connectors Claude
 * Code fetches load unless disabled, and under the file only when `allowAllClaudeAiMcps` allows them;
 * `strictPluginOnlyCustomization` with `mcp` closes `~/.claude.json` and `.mcp.json` (managed-mcp.md,
 * "Choose a pattern").
 */
const SCOPE_GATES: { readonly [S in ConfiguredCandidate['scope']]: (gate: Gate) => boolean } = {
  local: OPEN,
  project: OPEN,
  user: OPEN,
  plugin: (gate) => !gate.exclusive,
  connector: (gate) => gate.connectors,
};

type Exit = (input: McpLoadInput, exclusive: boolean) => string | undefined;

/**
 * The startup exits, in the order the page lists the cases (`--mcp-config`, then `--strict-mcp-config`,
 * then Chrome); the first that applies is the one. The page does not say which message wins when
 * several apply (spec/judgments.md).
 */
const EXITS: readonly Exit[] = [
  (input, exclusive) =>
    exclusive && !input.session.cloud && (input.session.mcpConfig ?? []).length > 0
      ? MCP_CONFIG_EXIT
      : undefined,
  (input, exclusive) =>
    exclusive && input.session.strictMcpConfig === true ? STRICT_MCP_CONFIG_EXIT : undefined,
  (input, exclusive) =>
    exclusive &&
    input.session.chrome?.flag === true &&
    !input.settings.allowClaudeInChromeWithManagedMcp
      ? CHROME_BLOCKED_ERROR
      : undefined,
];

const sourceOf = (candidate: McpCandidate, file: ManagedMcpFile | undefined): PlanSource =>
  candidate.scope === 'managed'
    ? file?.servers[candidate.name] === candidate.server
      ? 'managedFile'
      : 'managedSettings'
    : candidate.scope;

function chromeRuns(input: McpLoadInput, exclusive: boolean): boolean {
  const wants = input.session.chrome;
  if (wants === undefined || !(wants.flag || wants.byDefault)) return false;
  if (exclusive && !input.settings.allowClaudeInChromeWithManagedMcp) return false;
  return input.policy.check({
    name: CHROME_SERVER_NAME,
    server: CHROME_STAND_IN,
    origin: 'builtIn',
  }).allowed;
}

const EMPTY: McpLoadPlan = {
  exit: undefined,
  exclusive: false,
  servers: [],
  blocked: [],
  hidden: [],
  skipped: [],
  warnings: [],
  addError: undefined,
  chrome: false,
};

/**
 * The candidates of the plan: the file's, the provided ones and the scopes that stay open. `/mcp`
 * toggles apply to the provided servers and the scopes that stay open; the page documents them for
 * provided servers only, and a file server is always on (spec/judgments.md).
 */
function candidatesOf(input: McpLoadInput, exclusive: boolean): McpCandidate[] {
  if (input.session.strictMcpConfig === true) return [];
  const gate: Gate = {
    exclusive,
    pluginOnlyMcp: input.settings.pluginOnlyMcp,
    connectors:
      !input.settings.disableClaudeAiConnectors &&
      (!exclusive || (input.settings.allowAllClaudeAiMcps && !input.session.cloud)),
  };
  const fromFile = Object.entries(input.managedFile?.servers ?? {}).map(
    ([name, server]): McpCandidate => ({ scope: 'managed', name, server, enabled: true }),
  );
  const rest = input.candidates.filter((each) => SCOPE_GATES[each.scope](gate));
  const toggles = input.toggles ?? { disabledMcpServers: [], enabledMcpServers: [] };
  return [...fromFile, ...applyToggles([...input.managedServers, ...rest], toggles)];
}

/**
 * Which servers load, and what Claude Code says and does about the ones that do not (managed-mcp.md,
 * "Exclusive control with managed-mcp.json" and the sections under it). With a `managed-mcp.json` that
 * can be read and parsed, only its servers and the provided ones load; the lists (`deniedMcpServers`
 * always, `allowedMcpServers` for what is not the organization's own) filter the result. Without it
 * the scopes rank as usual and the flags keep their meaning: a `--mcp-config` server replaces a
 * provided one of its name and meets the allowlist, `--strict-mcp-config` leaves everything else out.
 * The built-in in-process servers of the app that started the session never pass through here.
 */
export function mcpLoadPlan(input: McpLoadInput): McpLoadPlan {
  const exclusive = input.managedFile !== undefined;
  const addError = exclusive ? EXCLUSIVE_ADD_ERROR : undefined;
  const exit = EXITS.map((each) => each(input, exclusive)).find((found) => found !== undefined);
  if (exit !== undefined) return { ...EMPTY, exit, exclusive, addError };
  const flagged = exclusive ? [] : (input.session.mcpConfig ?? []);
  const skipped = exclusive ? (input.session.mcpConfig ?? []).map((each) => each.name) : [];
  const flagNames = new Set(flagged.map((each) => each.name));
  const ranking = rankMcpServers(
    candidatesOf(input, exclusive).filter(
      (each) => each.scope !== 'managed' || !flagNames.has(each.name),
    ),
  );
  const planned: PlannedServer[] = [
    ...ranking.loaded.map((each) => ({
      name: each.name,
      server: each.server,
      source: sourceOf(each, input.managedFile),
      enabled: each.enabled !== false,
    })),
    ...flagged.map((each) => ({ ...each, source: 'flag' as const, enabled: true })),
  ].map((each) => ({ ...each, origin: ORIGIN_OF[each.source] }));
  const verdicts = planned.map((each) => ({ each, verdict: input.policy.check(each) }));
  return {
    ...EMPTY,
    exclusive,
    addError,
    servers: verdicts.filter(({ verdict }) => verdict.allowed).map(({ each }) => each),
    blocked: verdicts.flatMap(({ each, verdict }) =>
      verdict.allowed
        ? []
        : [{ name: each.name, server: each.server, source: each.source, ...verdict }],
    ),
    hidden: ranking.hidden,
    skipped,
    warnings:
      skipped.length > 0
        ? [`Skipped MCP servers because an enterprise MCP config is present: ${skipped.join(', ')}`]
        : [],
    chrome: chromeRuns(input, exclusive),
  };
}
