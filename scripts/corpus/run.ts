/**
 * `bun run corpus`: runs the kit over every plugin `corpus:fetch` fetched and compares it with the
 * oracle, `claude plugin validate --json`, plugin by plugin:
 *
 * - the verdict: the oracle reports an error exactly when `validatePlugin` does;
 * - each finding: an oracle error or warning `validatePlugin` reports with the same severity and
 *   message (each kit finding answers one oracle finding), and how many also share file and path;
 * - the loader's verdict (`loadPlugin` reports an error) on its own line: loading is lenient where
 *   the validator is strict, so the two are not expected to agree.
 *
 * Writes `.cache/corpus/report.json` and prints the agreement and the most frequent differences.
 * `--limit N` runs the first N plugins; `--only <text>` those whose id contains the text.
 */
import { join } from 'node:path';
import { z } from 'zod';
import { loadPlugin, validatePlugin } from '../../src/index.ts';
import { type ValidationIssue } from '../../src/entry/format.ts';
import { readRequirements } from '../spec/requirements.ts';
import { diskFiles } from './disk-files.ts';
import { corpusPluginSchema, INDEX_FILE, REPORT_FILE, type CorpusPlugin } from './location.ts';
import { oracle, type OracleFinding } from './oracle.ts';
import { pool } from './pool.ts';

interface Compared {
  readonly plugin: string;
  readonly oracleError: boolean;
  readonly kitError: boolean;
  readonly loadError: boolean;
  readonly matched: number;
  /** Matched findings that also agree on file and path. */
  readonly located: number;
  /** Matched findings the kit puts at another file or path. */
  readonly moved: readonly { readonly finding: OracleFinding; readonly issue: ValidationIssue }[];
  /** Oracle findings the kit does not report. */
  readonly missed: readonly OracleFinding[];
  /** Kit issues the oracle does not report. */
  readonly extra: readonly ValidationIssue[];
  readonly failure?: string;
}

type Target = CorpusPlugin & { readonly dir: string };

const same = (finding: OracleFinding, issue: ValidationIssue): boolean =>
  finding.severity === issue.severity && finding.message === issue.message;

/** Pairs each oracle finding with an unused kit issue of the same severity and message, the one at the same place first. */
function pair(findings: readonly OracleFinding[], issues: readonly ValidationIssue[]) {
  const unused = [...issues];
  const missed: OracleFinding[] = [];
  const moved: Compared['moved'][number][] = [];
  let located = 0;
  for (const finding of findings) {
    const exact = unused.findIndex(
      (issue) => same(finding, issue) && issue.file === finding.file && issue.path === finding.path,
    );
    const at = exact === -1 ? unused.findIndex((issue) => same(finding, issue)) : exact;
    if (at === -1) {
      missed.push(finding);
      continue;
    }
    const [issue] = unused.splice(at, 1);
    if (issue === undefined) continue;
    if (issue.file === finding.file && issue.path === finding.path) located += 1;
    else moved.push({ finding, issue });
  }
  return { missed, extra: unused, located, moved };
}

async function compare(release: string, plugin: Target): Promise<Compared> {
  const id = `${plugin.marketplace}/${plugin.name}`;
  const files = diskFiles(plugin.dir);
  const [report, validated, loaded] = await Promise.all([
    oracle(release, id, plugin.dir),
    validatePlugin({ files, label: plugin.dir }),
    loadPlugin({ files, fallbackName: plugin.name }),
  ]);
  const { missed, extra, located, moved } = pair(report.findings, validated.issues);
  return {
    plugin: id,
    oracleError: report.findings.some((finding) => finding.severity === 'error'),
    kitError: validated.issues.some((issue) => issue.severity === 'error'),
    loadError: loaded.issues.some((issue) => issue.severity === 'error'),
    matched: report.findings.length - missed.length,
    located,
    moved,
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
const onlyAt = process.argv.indexOf('--only');
const only = onlyAt === -1 ? '' : (process.argv[onlyAt + 1] ?? '');
const index = z.array(corpusPluginSchema).parse(JSON.parse(await Bun.file(INDEX_FILE).text()));
const fetched = index
  .filter((plugin): plugin is Target => plugin.dir !== undefined)
  .filter((plugin) => `${plugin.marketplace}/${plugin.name}`.includes(only))
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
const loadAgree = ran.filter((result) => result.oracleError === result.loadError);
console.log(
  `Loader verdict (loadPlugin error vs oracle error): ${pct(loadAgree.length, ran.length)}`,
);
console.log(
  `  oracle error, load clean: ${ran.filter((r) => r.oracleError && !r.loadError).length}`,
);
console.log(
  `  load error, oracle none: ${ran.filter((r) => r.loadError && !r.oracleError).length}`,
);
const located = ran.reduce((sum, result) => sum + result.located, 0);
console.log(`Oracle findings the kit reports: ${pct(matched, findings)} (${matched}/${findings})`);
console.log(`  also at the same file and path: ${pct(located, findings)} (${located}/${findings})`);
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
console.log('\nMost frequent findings the kit puts at another file or path (oracle -> kit):');
console.log(
  frequent(
    ran.flatMap((r) =>
      r.moved.map(
        ({ finding, issue }) =>
          `${shape(finding.message).slice(0, 60)} | ${finding.file} ${finding.path} -> ${issue.file} ${issue.path}`,
      ),
    ),
    15,
  ).join('\n'),
);
console.log(`\nReport: ${join(REPORT_FILE)}`);
