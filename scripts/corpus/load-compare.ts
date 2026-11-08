/**
 * `bun run corpus:load`: what the kit loads from every corpus plugin, compared with what Claude Code
 * loads (`load-oracle.ts`): whether the plugin loads, and the names of its skills (commands
 * included), agents, hook events, MCP servers and LSP servers. Prints the agreement per field and
 * writes every difference to `.cache/corpus/load-report.json`.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { createPluginHost, loadPlugin, type CommandRunner } from '../../src/index.ts';
import { fakeEnvironment, locations } from '../../src/testing/index.ts';
import { diskFiles } from './disk-files.ts';
import { readRequirements } from '../spec/requirements.ts';
import { CORPUS_DIR, INDEX_FILE } from './location.ts';
import { loadOracle, type LoadInventory } from './load-oracle.ts';
import { pool } from './pool.ts';

const indexSchema = z.array(
  z.object({ marketplace: z.string(), name: z.string(), dir: z.string().optional() }).loose(),
);
const manifestName = z.object({ name: z.string() }).loose();

const idle: CommandRunner = {
  run: () => Promise.resolve({ exitCode: 0, stdout: '', stderr: '', timedOut: false }),
};
const unprefixed = (name: string): string => name.slice(name.indexOf(':') + 1);

/** The name Claude Code looks the plugin up by: the manifest's, else the folder's. */
async function lookupName(dir: string): Promise<string> {
  try {
    const raw: unknown = JSON.parse(
      await readFile(join(dir, '.claude-plugin', 'plugin.json'), 'utf8'),
    );
    const parsed = manifestName.safeParse(raw);
    if (parsed.success) return parsed.data.name;
  } catch {
    // no manifest, or not JSON: the folder name
  }
  return basename(dir);
}

/** Two name lists joined as multisets: each name as often as the list that has it most. */
function unionByCount(a: readonly string[], b: readonly string[]): string[] {
  const count = (list: readonly string[]) =>
    list.reduce((map, name) => map.set(name, (map.get(name) ?? 0) + 1), new Map<string, number>());
  const left = count(a);
  const right = count(b);
  return [...new Set([...left.keys(), ...right.keys()])]
    .flatMap((name) =>
      Array.from({ length: Math.max(left.get(name) ?? 0, right.get(name) ?? 0) }, () => name),
    )
    .toSorted();
}

async function kitInventory(dir: string, name: string): Promise<LoadInventory> {
  const { plugin } = await loadPlugin({ files: diskFiles(dir), fallbackName: name });
  if (plugin === undefined)
    return {
      loaded: false,
      skills: [],
      agents: [],
      hookEvents: [],
      mcpServers: [],
      lspServers: [],
    };
  const host = createPluginHost({
    plugins: [{ id: `${plugin.name}@inline`, plugin }],
    ports: { commands: idle, locations: locations(), environment: fakeEnvironment() },
  });
  const session = host.openSession({
    sessionId: 'corpus',
    cwd: '/work/app',
    permissionMode: 'default',
    transcriptPath: '/work/app/t.jsonl',
  });
  const [agents, mcp, lsp] = await Promise.all([
    session.agents(),
    session.mcpServers(),
    session.lspServers(),
  ]);
  const listed = session.skills();
  const hookEvents = Object.entries(plugin.hooks)
    .filter(([, groups]) => Array.isArray(groups) && groups.length > 0)
    .map(([event]) => event);
  return {
    loaded: true,
    // Every skill and command the plugin gives, whoever may invoke it: the oracle lists them all,
    // a name twice when two components share it, so the two listings join as multisets.
    skills: unionByCount(
      listed.menu.map((entry) => unprefixed(entry.name)),
      listed.model.entries.map((entry) => unprefixed(entry.name)),
    ),
    agents: agents.resolved.map((agent) => unprefixed(agent.name)).toSorted(),
    hookEvents: hookEvents.toSorted(),
    mcpServers: mcp.resolved.map((server) => server.name).toSorted(),
    lspServers: lsp.resolved.map((server) => server.name).toSorted(),
  };
}

const FIELDS = ['loaded', 'skills', 'agents', 'hookEvents', 'mcpServers', 'lspServers'] as const;
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const version = (await readRequirements()).claudeCode;
const raw: unknown = JSON.parse(await readFile(INDEX_FILE, 'utf8'));
const plugins = indexSchema
  .parse(raw)
  .flatMap((entry) =>
    entry.dir === undefined ? [] : [{ key: `${entry.marketplace}/${entry.name}`, dir: entry.dir }],
  );
let done = 0;
const rows = await pool(plugins, 8, async (entry) => {
  const name = await lookupName(entry.dir);
  const [oracle, kit] = await Promise.all([
    loadOracle(version, entry.key, entry.dir, name),
    kitInventory(entry.dir, name).catch((error: unknown) => ({ crashed: String(error) })),
  ]);
  done += 1;
  if (done % 100 === 0) console.error(`${done}/${plugins.length}`);
  if ('crashed' in kit) return { plugin: entry.key, crashed: kit.crashed, differs: ['crash'] };
  const differs = FIELDS.filter(
    (field) =>
      !(oracle.loaded && kit.loaded
        ? same(oracle[field], kit[field])
        : oracle.loaded === kit.loaded),
  );
  return { plugin: entry.key, differs, oracle, kit };
});

const pct = (n: number): string => `${((100 * n) / rows.length).toFixed(1)}%`;
console.log(`Claude Code ${version} loading oracle over ${rows.length} plugins`);
console.log(
  `  whole inventory agrees: ${pct(rows.filter((row) => row.differs.length === 0).length)}`,
);
for (const field of [...FIELDS, 'crash'] as const)
  console.log(`  ${field} differs: ${rows.filter((row) => row.differs.includes(field)).length}`);
await writeFile(
  join(CORPUS_DIR, 'load-report.json'),
  `${JSON.stringify(
    rows.filter((row) => row.differs.length > 0),
    null,
    2,
  )}\n`,
);
