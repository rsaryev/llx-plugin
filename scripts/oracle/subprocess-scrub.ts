/**
 * The subprocess scrub oracle: what Claude Code leaves of each variable in a hook's environment
 * under `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` (env-vars.md, "What the subprocess environment scrub
 * removes" gives the rule by example). Run as a black box: every candidate of
 * tests/fixtures/subprocess-scrub/candidates.json is set in a bare environment with a private config
 * folder whose user settings hold one SessionStart hook that prints its environment; the API address
 * is one nobody listens on, so no model is called and no person's credential is set. The run stops
 * once the hook has written.
 *
 * `bun run oracle:subprocess-scrub` rewrites expected.json; `--check` fails instead when Claude Code
 * leaves other values. `bun test` checks the kit's scrub against that file without running Claude Code.
 */
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { ROOT } from '../docs/location.ts';

const DIR = join(ROOT, 'tests', 'fixtures', 'subprocess-scrub');
const CANDIDATES = join(DIR, 'candidates.json');
const EXPECTED = join(DIR, 'expected.json');
const NOBODY = 'http://127.0.0.1:9';
const WAIT_MS = 60_000;

const candidatesSchema = z.array(z.object({ name: z.string(), value: z.string() }));
export type ScrubCandidate = z.infer<typeof candidatesSchema>[number];

export const scrubExpectedSchema = z.object({
  claudeCodeVersion: z.string(),
  /** What the hook received for each candidate; `null` when the scrub removed it. */
  left: z.record(z.string(), z.string().nullable()),
});
export type ScrubExpected = z.infer<typeof scrubExpectedSchema>;

export async function readScrubCandidates(): Promise<ScrubCandidate[]> {
  return candidatesSchema.parse(JSON.parse(await readFile(CANDIDATES, 'utf8')));
}

export async function readScrubExpected(): Promise<ScrubExpected> {
  return scrubExpectedSchema.parse(JSON.parse(await readFile(EXPECTED, 'utf8')));
}

/** `env` output as variables; a value runs to the end of its line. */
const parseEnv = (text: string): Map<string, string> =>
  new Map(
    text
      .split('\n')
      .filter((line) => line.includes('='))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  );

async function waitForFile(path: string): Promise<string | undefined> {
  for (let waited = 0; waited < WAIT_MS; waited += 250) {
    const text = await readFile(path, 'utf8').catch(() => undefined);
    if (text !== undefined && text.endsWith('\n')) return text;
    await Bun.sleep(250);
  }
  return undefined;
}

/** What the hook received. */
async function probe(candidates: readonly ScrubCandidate[]): Promise<Map<string, string>> {
  const work = await realpath(await mkdtemp(join(tmpdir(), 'kit-scrub-')));
  const config = join(work, 'config');
  const out = join(work, 'out.txt');
  await mkdir(join(work, 'cwd'), { recursive: true });
  await mkdir(config, { recursive: true });
  const hook = { type: 'command', command: `env > ${out}.tmp && mv ${out}.tmp ${out}` };
  await writeFile(
    join(config, 'settings.json'),
    JSON.stringify({ hooks: { SessionStart: [{ hooks: [hook] }] } }),
  );
  const env = Object.fromEntries(candidates.map(({ name, value }) => [name, value]));
  const run = Bun.spawn(['claude', '-p', '--setting-sources', 'user', '--max-turns', '1', 'hi'], {
    cwd: join(work, 'cwd'),
    env: {
      ...env,
      PATH: process.env.PATH ?? '',
      HOME: work,
      CLAUDE_CONFIG_DIR: config,
      ANTHROPIC_BASE_URL: NOBODY,
      CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
    },
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
  });
  try {
    const text = await waitForFile(out);
    if (text === undefined) throw new Error('the SessionStart hook never wrote its environment');
    return parseEnv(text);
  } finally {
    run.kill();
    await run.exited;
    await rm(work, { recursive: true, force: true });
  }
}

async function claudeVersion(): Promise<string> {
  const run = Bun.spawn(['claude', '--version'], { stdout: 'pipe', stderr: 'ignore' });
  return (await new Response(run.stdout).text()).trim().split(' ')[0] ?? 'unknown';
}

async function main(): Promise<void> {
  const candidates = await readScrubCandidates();
  const got = await probe(candidates);
  const fresh: ScrubExpected = {
    claudeCodeVersion: await claudeVersion(),
    left: Object.fromEntries(candidates.map(({ name }) => [name, got.get(name) ?? null])),
  };
  const removed = Object.values(fresh.left).filter((value) => value === null).length;
  console.log(
    `${candidates.length} variables: ${removed} removed (Claude Code ${fresh.claudeCodeVersion})`,
  );
  if (process.argv.includes('--check')) {
    const previous = await readScrubExpected().catch(() => undefined);
    if (JSON.stringify(previous?.left) !== JSON.stringify(fresh.left)) {
      console.error(
        'expected.json differs from Claude Code: run `bun run oracle:subprocess-scrub`',
      );
      process.exit(1);
    }
    return;
  }
  await writeFile(EXPECTED, `${JSON.stringify(fresh, null, 2)}\n`);
}

if (import.meta.main) await main();
