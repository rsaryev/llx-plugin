import { sideloadRefusal } from './sideload.ts';
import {
  refuse,
  type Contribution,
  type FlagContext,
  type McpConfigSource,
  type SessionPlan,
} from './types.ts';
import { wordsOf } from './values.ts';
import { isRecord } from '../../protocol/is-record.ts';

/**
 * `--mcp-config` and `--strict-mcp-config` (cli-reference.md, "CLI flags"; plugins/org.md,
 * `disableSideloadFlags`; headless.md, "Start faster with bare mode"). `--mcp-config` loads "MCP
 * servers from JSON files or strings"; with `-p` Claude Code "waits for still-pending servers to
 * connect before running the first turn, up to the `MCP_TIMEOUT` startup timeout, 30 seconds by
 * default". `--strict-mcp-config` means "only use MCP servers from `--mcp-config`, ignoring all other
 * MCP configurations". `disableSideloadFlags` rejects `--mcp-config` "unless every server in it is an
 * in-process `type: "sdk"` entry". What a server does once loaded is the MCP stream's; this maps the
 * flags to the sources and the wait.
 */

/** "30 seconds by default." */
export const DEFAULT_MCP_TIMEOUT_MS = 30_000;

const isInline = (value: string): boolean => value.trimStart().startsWith('{');

/**
 * A value that starts with `{` is the JSON itself and stays whole; any other holds one or more file
 * paths, "space-separated" (cli-reference.md, `--mcp-config`).
 */
const sourcesOf = (value: string): readonly McpConfigSource[] =>
  isInline(value)
    ? [{ kind: 'inline', text: value }]
    : wordsOf(value).map((path): McpConfigSource => ({ kind: 'file', path }));

type TextOf<K extends McpConfigSource['kind']> = (
  source: Extract<McpConfigSource, { kind: K }>,
  context: FlagContext,
) => string | undefined;

const TEXT_OF: { readonly [K in McpConfigSource['kind']]: TextOf<K> } = {
  inline: (source) => source.text,
  file: (source, context) => context.facts.files[source.path]?.text,
};

const textOf = <K extends McpConfigSource['kind']>(
  source: Extract<McpConfigSource, { kind: K }>,
  context: FlagContext,
): string | undefined => TEXT_OF[source.kind](source, context);

// oxlint-disable-next-line kit/no-kind-literal -- `type` is a field of the user's JSON, not a closed set of the kit
const isInProcessServer = (server: unknown): boolean => isRecord(server) && server.type === 'sdk';

/** Whether every server of the config is `type: "sdk"`; a config that cannot be read is not. */
function onlySdkServers(text: string | undefined): boolean {
  if (text === undefined) return false;
  try {
    const parsed: unknown = JSON.parse(text);
    const servers = isRecord(parsed) ? parsed.mcpServers : undefined;
    return isRecord(servers) && Object.values(servers).every(isInProcessServer);
  } catch {
    return false;
  }
}

/** `MCP_TIMEOUT` is in milliseconds; anything that is not a positive number is the default. */
function waitMs(context: FlagContext): number {
  const given = Number(context.facts.env.MCP_TIMEOUT);
  return Number.isFinite(given) && given > 0 ? given : DEFAULT_MCP_TIMEOUT_MS;
}

export function mcpConfig(values: readonly string[], context: FlagContext): Contribution {
  const sources = values.flatMap(sourcesOf);
  const refusal = sideloadRefusal('--mcp-config', context.facts);
  if (
    refusal !== undefined &&
    !sources.every((source) => onlySdkServers(textOf(source, context)))
  ) {
    return refuse(refusal);
  }
  return {
    mcpConfigs: sources,
    ...(context.facts.print ? { mcpWaitMs: waitMs(context) } : {}),
  };
}

export const strictMcpConfig = (): Contribution => ({ strictMcpConfig: true });

/** The places MCP servers are read from. */
export const MCP_READ_SOURCES = ['user', 'project', 'local', 'plugins', 'command-line'] as const;
export type McpReadSource = (typeof MCP_READ_SOURCES)[number];

/**
 * The sources a session reads servers from: `--strict-mcp-config` and `--bare` leave the command
 * line's alone ("only servers supplied on the command line connect"). How a managed MCP file
 * combines with `--strict-mcp-config` is the MCP stream's (managed-mcp.md).
 */
export function mcpSourcesRead(
  plan: Pick<SessionPlan, 'strictMcpConfig' | 'skipped'>,
): readonly McpReadSource[] {
  const commandLineOnly = plan.strictMcpConfig || plan.skipped.includes('mcp-servers');
  return commandLineOnly ? ['command-line'] : MCP_READ_SOURCES;
}
