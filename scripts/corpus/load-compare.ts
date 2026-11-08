/**
 * `bun run corpus:load`: what the kit loads from every corpus plugin, compared with what Claude Code
 * loads (`load-oracle.ts`): whether the plugin loads, and the names of its skills (commands
 * included), agents, hook events, MCP servers and LSP servers. Prints the agreement per field and
 * writes every difference to `.cache/corpus/load-report.json`.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { readRequirements } from '../spec/requirements.ts';
import { CORPUS_DIR, INDEX_FILE } from './location.ts';
import { kitInventory } from './load-kit.ts';
import { loadOracle } from './load-oracle.ts';
import { pool } from './pool.ts';

const indexSchema = z.array(
  z.object({ marketplace: z.string(), name: z.string(), dir: z.string().optional() }).loose(),
);
const manifestName = z.object({ name: z.string() }).loose();

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
  console.log(
    `  ${field} differs: ${rows.filter((row) => row.differs.some((one) => one === field)).length}`,
  );
await writeFile(
  join(CORPUS_DIR, 'load-report.json'),
  `${JSON.stringify(
    rows.filter((row) => row.differs.length > 0),
    null,
    2,
  )}\n`,
);
