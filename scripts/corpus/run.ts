/**
 * `bun run corpus`: runs the kit over every plugin `corpus:fetch` fetched and compares it with the
 * oracle, `claude plugin validate --json`, plugin by plugin:
 *
 * - the verdict: the oracle reports an error exactly when the kit does (an error keeps a plugin
 *   from loading);
 * - each finding: an oracle error or warning the kit reports with the same severity and message.
 *
 * Writes `.cache/corpus/report.json` and prints the agreement and the most frequent differences.
 * `--limit N` runs the first N plugins.
 */
import { join } from 'node:path';
import { loadPlugin, validateManifest, type PluginIssue } from '../../src/index.ts';
import { readRequirements } from '../spec/requirements.ts';
import { diskFiles } from './disk-files.ts';
import { z } from 'zod';
import { corpusPluginSchema, INDEX_FILE, REPORT_FILE, type CorpusPlugin } from './location.ts';
import { oracle, type OracleFinding } from './oracle.ts';
import { pool } from './pool.ts';

interface Compared {
  readonly plugin: string;
  readonly oracleError: boolean;
  readonly kitError: boolean;
  readonly matched: number;
  /** Oracle findings the kit does not report. */
  readonly missed: readonly OracleFinding[];
  /** Kit issues the oracle does not report. */
  readonly extra: readonly PluginIssue[];
  readonly failure?: string;
}

async function kitIssues(plugin: CorpusPlugin & { readonly dir: string }): Promise<PluginIssue[]> {
  const files = diskFiles(plugin.dir);
  const loaded = await loadPlugin({ files, fallbackName: plugin.name });
  const text = await files.readText('.claude-plugin/plugin.json');
  let validated: PluginIssue[] = [];
  if (text !== undefined) {
    try {
      validated = validateManifest(JSON.parse(text));
    } catch {
      validated = [];
    }
  }
  const seen = new Set<string>();
  return [...loaded.issues, ...validated].filter((issue) => {
    const key = `${issue.severity}|${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const same = (finding: OracleFinding, issue: PluginIssue): boolean =>
  finding.severity === issue.severity && finding.message === issue.message;

async function compare(
  release: string,
  plugin: CorpusPlugin & { readonly dir: string },
): Promise<Compared> {
  const id = `${plugin.marketplace}/${plugin.name}`;
  const [report, issues] = await Promise.all([oracle(release, id, plugin.dir), kitIssues(plugin)]);
  const missed = report.findings.filter((finding) => !issues.some((issue) => same(finding, issue)));
  const extra = issues.filter((issue) => !report.findings.some((finding) => same(finding, issue)));
  return {
    plugin: id,
    oracleError: report.findings.some((finding) => finding.severity === 'error'),
    kitError: issues.some((issue) => issue.severity === 'error'),
    matched: report.findings.length - missed.length,
    missed,
    extra,
    ...(report.failure === undefined ? {} : { failure: report.failure }),
  };
}

function frequent(messages: readonly string[], top: number): string[] {
  const counts = new Map<string, number>();
  for (const message of messages) counts.set(message, (counts.get(message) ?? 0) + 1);
  return [...counts]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([message, count]) => `${String(count).padStart(5)}  ${message}`);
}

/** Masks quoted names and numbers so findings of one kind count together. */
const shape = (message: string): string =>
  message
    .replaceAll(/"[^"]*"|'[^']*'|`[^`]*`/g, '<…>')
    .replaceAll(/\d+/g, 'N')
    .slice(0, 160);

const limitAt = process.argv.indexOf('--limit');
const limit = limitAt === -1 ? Infinity : Number(process.argv[limitAt + 1]);
const index = z.array(corpusPluginSchema).parse(JSON.parse(await Bun.file(INDEX_FILE).text()));
const fetched = index
  .filter((plugin): plugin is CorpusPlugin & { readonly dir: string } => plugin.dir !== undefined)
  .slice(0, limit);
const release = (await readRequirements()).claudeCode;
let done = 0;
const results = await pool(fetched, 8, async (plugin) => {
  const result = await compare(release, plugin);
  done += 1;
  if (done % 200 === 0) console.log(`${done}/${fetched.length}`);
  return result;
});
await Bun.write(REPORT_FILE, `${JSON.stringify(results, null, 2)}\n`);

const ran = results.filter((result) => result.failure === undefined);
const agree = ran.filter((result) => result.oracleError === result.kitError);
const findings = ran.reduce((sum, result) => sum + result.matched + result.missed.length, 0);
const matched = ran.reduce((sum, result) => sum + result.matched, 0);
const pct = (part: number, whole: number) => `${((100 * part) / Math.max(whole, 1)).toFixed(1)}%`;
console.log(`Plugins compared: ${ran.length} (oracle failed on ${results.length - ran.length})`);
console.log(`Verdict agreement: ${pct(agree.length, ran.length)} (${agree.length}/${ran.length})`);
console.log(`  oracle error, kit none: ${ran.filter((r) => r.oracleError && !r.kitError).length}`);
console.log(`  kit error, oracle none: ${ran.filter((r) => r.kitError && !r.oracleError).length}`);
console.log(`Oracle findings the kit reports: ${pct(matched, findings)} (${matched}/${findings})`);
console.log('\nMost frequent oracle findings the kit misses:');
console.log(
  frequent(
    ran.flatMap((r) => r.missed.map((f) => `${f.severity}: ${shape(f.message)}`)),
    25,
  ).join('\n'),
);
console.log('\nMost frequent kit issues the oracle does not report:');
console.log(
  frequent(
    ran.flatMap((r) => r.extra.map((i) => `${i.severity}: ${shape(i.message)}`)),
    25,
  ).join('\n'),
);
console.log(`\nReport: ${join(REPORT_FILE)}`);
