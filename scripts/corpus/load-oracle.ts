/**
 * The loading oracle: what Claude Code itself loads from a plugin folder, read from
 * `claude --plugin-dir <dir> plugin details <name>` run as a black box (never reading the program),
 * in a private config folder so the person's own settings, plugins and login play no part. The
 * command is offline: it prints the component inventory and calls no model.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { CORPUS_DIR } from './location.ts';

/** What `plugin details` lists: names per component, hook events, or absence when it did not load. */
export interface LoadInventory {
  readonly loaded: boolean;
  readonly skills: readonly string[];
  readonly agents: readonly string[];
  readonly hookEvents: readonly string[];
  readonly mcpServers: readonly string[];
  readonly lspServers: readonly string[];
}

const inventorySchema = z.object({
  loaded: z.boolean(),
  skills: z.array(z.string()),
  agents: z.array(z.string()),
  hookEvents: z.array(z.string()),
  mcpServers: z.array(z.string()),
  lspServers: z.array(z.string()),
});

const ROW = /^\s{2}(Skills|Agents|Hooks|MCP servers|LSP servers) \((\d+)\)(?:\s{2}(.*))?$/;
const FIELDS = {
  Skills: 'skills',
  Agents: 'agents',
  Hooks: 'hookEvents',
  'MCP servers': 'mcpServers',
  'LSP servers': 'lspServers',
} as const;
const isRowLabel = (label: string): label is keyof typeof FIELDS => Object.hasOwn(FIELDS, label);

/** The names of one inventory row: a comma list, with the trailing note in parentheses dropped. */
const namesOf = (rest: string | undefined): string[] =>
  (rest ?? '')
    .replace(/\s{2}\(.*\)\s*$/, '')
    .split(', ')
    .map((name) => name.trim())
    .filter((name) => name !== '')
    .toSorted();

/** Reads the inventory block of `plugin details`; a plugin that did not load prints "not found". */
export function parseDetails(text: string): LoadInventory {
  const found = {
    skills: [] as string[],
    agents: [] as string[],
    hookEvents: [] as string[],
    mcpServers: [] as string[],
    lspServers: [] as string[],
  };
  let loaded = false;
  for (const line of text.split('\n')) {
    const row = ROW.exec(line);
    if (row === null) continue;
    const label = row[1] ?? '';
    if (!isRowLabel(label)) continue;
    loaded = true;
    found[FIELDS[label]] = namesOf(row[3]);
  }
  return { loaded, ...found };
}

const ORACLE_DIR = join(CORPUS_DIR, 'oracle-load');

/** Runs the oracle on one folder (cached by the Claude Code version and the plugin's corpus key). */
export async function loadOracle(
  version: string,
  key: string,
  dir: string,
  name: string,
): Promise<LoadInventory> {
  const cacheDir = join(ORACLE_DIR, version);
  const cached = join(cacheDir, `${key.replaceAll('/', '__')}.json`);
  try {
    const raw: unknown = JSON.parse(await readFile(cached, 'utf8'));
    return inventorySchema.parse(raw);
  } catch {
    // not cached yet
  }
  const home = join(ORACLE_DIR, 'home');
  await mkdir(home, { recursive: true });
  const run = Bun.spawn(['claude', '--plugin-dir', dir, 'plugin', 'details', name], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: home },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const timer = setTimeout(() => run.kill(), 60_000);
  const [out, err] = await Promise.all([
    new Response(run.stdout).text(),
    new Response(run.stderr).text(),
  ]);
  await run.exited;
  clearTimeout(timer);
  const inventory = parseDetails(`${out}\n${err}`);
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cached, `${JSON.stringify(inventory)}\n`);
  return inventory;
}
