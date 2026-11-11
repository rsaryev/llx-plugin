/**
 * `bun run corpus:runtime`: what a Claude Code SESSION registers from each corpus plugin, read from
 * its `init` event (`runtimeOracle`), against what the kit's session registers (`kitRegistry`): the
 * plugin loaded, its agents, slash commands, skills, MCP servers and the output style. Only the
 * plugins a session runs nothing of on its way to `init` are asked (`runsAtSessionStart`); the rest
 * are counted as skipped, never run. Prints the agreement per field and writes every difference to
 * `.cache/corpus/runtime-report.json`. `--limit N` asks the first N plugins; `--only a,b` asks the
 * plugins with those `marketplace/name` ids.
 */
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { CLAUDE_BIN, oracleRelease } from '../oracle/claude-bin.ts';
import { kitRegistry } from '../oracle/kit-registry.ts';
import { compareRegistries, FIELDS, type FieldVerdict } from '../oracle/registry-diff.ts';
import {
  registryOfAll,
  runtimeOracle,
  type Registry,
  type RuntimeInit,
} from '../oracle/runtime.ts';
import { readRequirements } from '../spec/requirements.ts';
import { CORPUS_DIR, readCorpusTargets } from './location.ts';
import { lookupName } from './plugin-name.ts';
import { pool } from './pool.ts';
import { runsAtSessionStart } from './session-start.ts';

type Row =
  | { readonly plugin: string; readonly status: 'skipped' | 'no-init' }
  | {
      readonly plugin: string;
      readonly status: 'compared';
      readonly differs: readonly FieldVerdict[];
    };

/**
 * The plugins Claude Code itself loaded from `dir` (its `init` gives each one's path), so a folder of
 * plugins is read from the oracle and not from the kit; none loaded falls back to the manifest name.
 */
async function oracleNames(init: RuntimeInit, dir: string): Promise<string[]> {
  const root = await realpath(dir);
  const under = (path: unknown) =>
    typeof path === 'string' && (path === root || path.startsWith(root + sep));
  const names = init.plugins.filter((plugin) => under(plugin['path'])).map((p) => p.name);
  return names.length > 0 ? names : [await lookupName(dir)];
}

/**
 * What a session lists with no plugin of the corpus: the built-in skills and commands and what this
 * machine's managed settings load. A bare `code-review` is Claude Code's own, not the plugin's.
 */
async function baselineNames(): Promise<ReadonlySet<string>> {
  const empty = join(CORPUS_DIR, 'baseline-empty');
  await mkdir(empty, { recursive: true });
  const init = await runtimeOracle(empty);
  if (init === undefined) throw new Error('the oracle printed no init for an empty --plugin-dir');
  return new Set([...init.agents, ...init.slash_commands, ...init.skills]);
}

const baseline = await baselineNames();
const notBaseline = (names: readonly string[]) => names.filter((name) => !baseline.has(name));
const withoutBaseline = (registry: Registry): Registry => ({
  ...registry,
  agents: notBaseline(registry.agents),
  slashCommands: notBaseline(registry.slashCommands),
  skills: notBaseline(registry.skills),
});

async function compareOne(plugin: string, dir: string): Promise<Row> {
  if (await runsAtSessionStart(dir)) return { plugin, status: 'skipped' };
  const init = await runtimeOracle(dir);
  if (init === undefined) return { plugin, status: 'no-init' };
  const expected = withoutBaseline(registryOfAll(init, await oracleNames(init, dir)));
  const kit = await kitRegistry(dir);
  const verdicts = compareRegistries(plugin, kit, expected, {});
  return { plugin, status: 'compared', differs: verdicts.filter((v) => v.status === 'differs') };
}

const release = await oracleRelease((await readRequirements()).claudeCode);
const limitAt = process.argv.indexOf('--limit');
const limit = limitAt === -1 ? Infinity : Number(process.argv[limitAt + 1]);
const onlyAt = process.argv.indexOf('--only');
const only = onlyAt === -1 ? undefined : new Set((process.argv[onlyAt + 1] ?? '').split(','));
const plugins = (await readCorpusTargets())
  .filter(({ key }) => only === undefined || only.has(key))
  .slice(0, limit);

let done = 0;
const rows = await pool(plugins, 6, async ({ key: id, dir }) => {
  const row = await compareOne(id, dir).catch((error: unknown): Row => ({
    plugin: `${id}: ${String(error)}`,
    status: 'no-init',
  }));
  done += 1;
  if (done % 100 === 0) console.log(`${done}/${plugins.length}`);
  return row;
});

const compared = rows.filter((row) => row.status === 'compared');
const count = (status: Row['status']) => rows.filter((row) => row.status === status).length;
console.log(`Claude Code ${release} (${CLAUDE_BIN}) session oracle over ${rows.length} plugins`);
console.log(
  `  compared ${compared.length}, skipped ${count('skipped')} (they run code at start), no init ${count('no-init')}`,
);
const whole = compared.filter((row) => row.differs.length === 0).length;
console.log(
  `  whole registry agrees: ${((100 * whole) / Math.max(compared.length, 1)).toFixed(1)}%`,
);
for (const field of FIELDS) {
  const n = compared.filter((row) => row.differs.some((v) => v.field === field)).length;
  console.log(`  ${field} differs: ${n}`);
}
const report = join(CORPUS_DIR, 'runtime-report.json');
await writeFile(
  report,
  `${JSON.stringify(
    rows.filter((row) =>
      row.status !== 'compared' ? row.status === 'no-init' : row.differs.length > 0,
    ),
    null,
    2,
  )}\n`,
);
console.log(`Report: ${report}`);
