/**
 * The oracle: `claude plugin validate --json <dir>` of the Claude Code release the requirements were
 * extracted from (SP3), run as a program and never read. Its findings are cached per plugin in
 * `.cache/corpus/oracle/`, keyed by the release, so a rerun compares without running it again.
 */
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { CORPUS_DIR } from './location.ts';

const findingSchema = z.object({
  severity: z.enum(['error', 'warning']),
  /** The file the finding is about, relative to the plugin root. */
  file: z.string(),
  path: z.string(),
  message: z.string(),
});
export type OracleFinding = z.infer<typeof findingSchema>;

const reportSchema = z.object({
  ran: z.boolean(),
  findings: z.array(findingSchema),
  failure: z.string().optional(),
});
export type OracleReport = z.infer<typeof reportSchema>;

const rawIssue = z.object({ path: z.string().nullish(), message: z.string().optional() });
type RawIssue = z.infer<typeof rawIssue>;
const rawFile = z.object({
  file: z.string().optional(),
  errors: z.array(rawIssue).optional(),
  warnings: z.array(rawIssue).optional(),
});
type RawFile = z.infer<typeof rawFile>;
/** The part of `claude plugin validate --json` the corpus reads. */
const rawReport = z.object({ manifest: rawFile.nullish(), contents: z.array(rawFile).nullish() });

const relativeTo = (dir: string, file: string | undefined): string =>
  file === undefined ? '' : file.startsWith(`${dir}/`) ? file.slice(dir.length + 1) : file;

function findingsOf(dir: string, files: readonly RawFile[]): OracleFinding[] {
  return files.flatMap((raw) => {
    const file = relativeTo(dir, raw.file);
    const of = (severity: OracleFinding['severity'], issues: readonly RawIssue[] = []) =>
      issues.map((issue) => ({
        severity,
        file,
        path: issue.path ?? '',
        message: issue.message ?? '',
      }));
    return [...of('error', raw.errors), ...of('warning', raw.warnings)];
  });
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function runOracle(dir: string): Promise<OracleReport> {
  const child = Bun.spawn(['claude', 'plugin', 'validate', '--json', dir], {
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 120_000,
  });
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  await child.exited;
  const raw = rawReport.safeParse(parseJson(stdout));
  if (!raw.success) return { ran: false, findings: [], failure: (stderr || stdout).slice(0, 500) };
  const files = [...(raw.data.manifest ? [raw.data.manifest] : []), ...(raw.data.contents ?? [])];
  return { ran: true, findings: findingsOf(dir, files) };
}

export async function oracle(release: string, key: string, dir: string): Promise<OracleReport> {
  const cache = join(CORPUS_DIR, 'oracle', release, `${key}.json`);
  if (existsSync(cache)) {
    const cached = reportSchema.safeParse(parseJson(await Bun.file(cache).text()));
    if (cached.success) return cached.data;
  }
  const report = await runOracle(dir);
  if (report.ran) {
    await mkdir(dirname(cache), { recursive: true });
    await Bun.write(cache, JSON.stringify(report));
  }
  return report;
}
