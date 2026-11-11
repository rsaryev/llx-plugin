import { error, type PluginIssue } from '../../format/issues.ts';
import { readMcpConfig, type PluginMcpServer } from '../../format/mcp-config.ts';
import type { TextFileReader } from '../../ports/index.ts';
import { isRecord } from '../../protocol/is-record.ts';
import { parseJson } from '../../format/read-json.ts';

/**
 * Where Claude Code looks for `managed-mcp.json` (managed-mcp.md, "Deploy managed-mcp.json"): "Linux
 * and WSL" share a row, so the platform union names both and the registry gives them one path.
 */
export const MANAGED_MCP_PLATFORMS = ['macos', 'linux', 'wsl', 'windows'] as const;
export type ManagedMcpPlatform = (typeof MANAGED_MCP_PLATFORMS)[number];

const LINUX_PATH = '/etc/claude-code/managed-mcp.json';

const MANAGED_MCP_FILE_PATHS: { readonly [P in ManagedMcpPlatform]: string } = {
  macos: '/Library/Application Support/ClaudeCode/managed-mcp.json',
  linux: LINUX_PATH,
  wsl: LINUX_PATH,
  windows: 'C:\\Program Files\\ClaudeCode\\managed-mcp.json',
};

export const managedMcpFilePath = (platform: ManagedMcpPlatform): string =>
  MANAGED_MCP_FILE_PATHS[platform];

/** The servers a deployed `managed-mcp.json` defines, already read like a project `.mcp.json`. */
export interface ManagedMcpFile {
  readonly servers: Readonly<Record<string, PluginMcpServer>>;
}

export interface ManagedMcpFileRead {
  /** Undefined when there is no file, or Claude Code "can't read or parse" it: no exclusive control then. */
  readonly file: ManagedMcpFile | undefined;
  readonly issues: readonly PluginIssue[];
}

const FILE_NAME = 'managed-mcp.json';

const unreadable = (reason: string): ManagedMcpFileRead => ({
  file: undefined,
  issues: [
    error(
      FILE_NAME,
      `The enterprise MCP config could not be read and takes no control of MCP servers: ${reason}`,
    ),
  ],
});

/**
 * The file's text: "the same format as a project `.mcp.json` file" (a `mcpServers` wrapper; the
 * reader of `.mcp.json` also takes the bare map). Only a file Claude Code "can read and parse" takes
 * exclusive control, so text that is no JSON object is an issue and no file. An entry Claude Code
 * would drop is an issue and the others stay (spec/judgments.md for the wording and the empty file).
 */
export function readManagedMcpFile(text: string | undefined): ManagedMcpFileRead {
  if (text === undefined) return { file: undefined, issues: [] };
  const parsed = parseJson(text);
  if ('problem' in parsed) return unreadable(parsed.problem);
  if (!isRecord(parsed.value)) return unreadable('the file must hold a JSON object');
  const read = readMcpConfig(parsed.value, FILE_NAME);
  return { file: { servers: read.servers }, issues: read.issues };
}

/** Reads the file of `platform` through the host's reader; a machine without it has no file. */
export async function loadManagedMcpFile(
  reader: TextFileReader,
  platform: ManagedMcpPlatform,
  { signal }: { readonly signal?: AbortSignal | undefined } = {},
): Promise<ManagedMcpFileRead> {
  return readManagedMcpFile(await reader.readText(managedMcpFilePath(platform), signal));
}
