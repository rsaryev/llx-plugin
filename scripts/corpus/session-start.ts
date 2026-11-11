import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

/**
 * Whether a session would start or run anything of the plugin's own on its way to `init`: hooks
 * (mods included, they register through `hooks/hooks.json`), MCP, LSP and channel servers,
 * monitors, a `subagentStatusLine` command, and the hooks or MCP servers a skill's or an agent's
 * frontmatter declares. Read from the files alone, never through the kit under test. A plugin that
 * has any of them is left out of the runtime oracle: it would run third-party code.
 */
const RUNNING_FILES = new Set(['hooks.json', '.mcp.json', '.lsp.json', 'monitors.json']);
const RUNNING_EXTENSIONS = ['.mcpb', '.dxt'];
const RUNNING_MANIFEST_KEYS = ['hooks', 'mcpServers', 'lspServers', 'channels', 'monitors'];
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const RUNNING_FRONTMATTER = /^(?:hooks|mcpServers|mcp_servers)\s*:/m;

async function readJson(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const raw: unknown = JSON.parse(await readFile(path, 'utf8'));
    return typeof raw === 'object' && raw !== null ? Object.fromEntries(Object.entries(raw)) : {};
  } catch {
    return undefined;
  }
}

async function manifestRuns(dir: string): Promise<boolean> {
  const manifest = await readJson(join(dir, '.claude-plugin', 'plugin.json'));
  if (manifest === undefined) return false;
  const experimental = manifest['experimental'];
  const monitors =
    typeof experimental === 'object' && experimental !== null && 'monitors' in experimental;
  const settings = manifest['settings'];
  const statusLine =
    typeof settings === 'object' && settings !== null && 'subagentStatusLine' in settings;
  return monitors || statusLine || RUNNING_MANIFEST_KEYS.some((key) => key in manifest);
}

async function frontmatterRuns(path: string): Promise<boolean> {
  const text = await readFile(path, 'utf8').catch(() => '');
  const block = FRONTMATTER.exec(text)?.[1];
  return block !== undefined && RUNNING_FRONTMATTER.test(block);
}

async function rootSettingsRun(dir: string): Promise<boolean> {
  const settings = await readJson(join(dir, 'settings.json'));
  return settings !== undefined && 'subagentStatusLine' in settings;
}

/** Whether `dir` holds anything a session starts or runs before `init`, nested plugins included. */
export async function runsAtSessionStart(dir: string): Promise<boolean> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  const roots = [
    dir,
    ...entries
      .filter(
        (e) =>
          e.isFile() && e.name === 'plugin.json' && basename(e.parentPath) === '.claude-plugin',
      )
      .map((e) => dirname(e.parentPath)),
  ];
  for (const root of roots) {
    if ((await manifestRuns(root)) || (await rootSettingsRun(root))) return true;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const { name } = entry;
    if (RUNNING_FILES.has(name) || RUNNING_EXTENSIONS.some((ext) => name.endsWith(ext)))
      return true;
    if (name.endsWith('.md') && (await frontmatterRuns(join(entry.parentPath, name)))) return true;
  }
  return false;
}
