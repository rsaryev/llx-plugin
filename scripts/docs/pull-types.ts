/**
 * Pulls the TypeScript declarations Claude Code writes for mods into `.cache/claude-types/` (never
 * committed): the reference the docs name as complete for the mods surface (plugins/mods/reference.md,
 * the note under the title; create.md, "Get type definitions for your version"), the evidence
 * `spec/mods-declarations.json` is extracted from (AGENTS.md, E2a).
 *
 * The declarations are got the documented way, as a black box: an interactive session of the
 * program (`CLAUDE_ORACLE_BIN`, else `claude` on `PATH`) loads a scratch mod from `--plugin-dir`, and
 * Claude Code writes `.claude-plugin/types/` beside it. The session runs in a pseudo-terminal with a
 * private home, config folder and working folder, no inherited variable but `PATH`, an invalid key
 * and an API address nothing listens on; nothing is typed into it, so no prompt reaches a model. It
 * is stopped as soon as the files are written. `VERSION` records the release named on the first line
 * of `claude-code/index.d.ts` ("Written by Claude Code <version>."); the spec gate (SP8) wants it to
 * be the release of the requirements, so run it with `CLAUDE_ORACLE_BIN` set to that program.
 *
 *   CLAUDE_ORACLE_BIN=~/.local/share/claude/versions/2.1.321 bun run types:pull
 */
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLAUDE_BIN } from '../oracle/claude-bin.ts';
import { TYPES_DIR, TYPES_FILES } from './location.ts';

const TIMEOUT_MS = 90_000;
const POLL_MS = 250;
const KEY = 'sk-ant-invalid-for-types';

/** A mod with nothing but one hook: the smallest folder Claude Code loads as a mod. */
async function writeScratchMod(mod: string): Promise<void> {
  await mkdir(join(mod, '.claude-plugin'), { recursive: true });
  await mkdir(join(mod, 'hooks'), { recursive: true });
  await writeFile(
    join(mod, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'types-pull', version: '0.0.0' }),
  );
  await writeFile(join(mod, 'hooks', 'hooks.json'), JSON.stringify({ modules: ['./register.js'] }));
  await writeFile(
    join(mod, 'hooks', 'register.js'),
    "export function register(on) { on('session.start', (_$, e, next) => next(e)) }\n",
  );
}

/** The config that skips the first-run screens: onboarding done, the key approved, the folder trusted. */
async function writeConfig(config: string, work: string): Promise<void> {
  await mkdir(config, { recursive: true });
  await writeFile(
    join(config, '.claude.json'),
    JSON.stringify({
      hasCompletedOnboarding: true,
      theme: 'dark',
      customApiKeyResponses: { approved: [KEY.slice(-20)], rejected: [] },
      projects: { [work]: { hasTrustDialogAccepted: true, hasCompletedProjectOnboarding: true } },
    }),
  );
}

const isolatedEnv = (scratch: string): Record<string, string> => ({
  PATH: process.env.PATH ?? '',
  TERM: 'xterm-256color',
  HOME: join(scratch, 'home'),
  CLAUDE_CONFIG_DIR: join(scratch, 'config'),
  ANTHROPIC_API_KEY: KEY,
  ANTHROPIC_BASE_URL: 'http://127.0.0.1:9',
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  DISABLE_TELEMETRY: '1',
  DISABLE_AUTOUPDATER: '1',
});

const sizeOf = async (path: string): Promise<number> =>
  stat(path).then(
    (info) => info.size,
    () => -1,
  );

/** Whether every file is written and none grew over the last poll. */
async function settled(dir: string, sizes: Map<string, number>): Promise<boolean> {
  let done = true;
  for (const file of TYPES_FILES) {
    const size = await sizeOf(join(dir, file));
    if (size <= 0 || sizes.get(file) !== size) done = false;
    sizes.set(file, size);
  }
  return done;
}

async function waitForTypes(dir: string): Promise<boolean> {
  const sizes = new Map<string, number>();
  for (let waited = 0; waited < TIMEOUT_MS; waited += POLL_MS) {
    if (await settled(dir, sizes)) return true;
    await Bun.sleep(POLL_MS);
  }
  return false;
}

async function pull(scratch: string): Promise<string> {
  const mod = join(scratch, 'mod');
  const work = join(scratch, 'work');
  await mkdir(work, { recursive: true });
  await mkdir(join(scratch, 'home'), { recursive: true });
  await writeScratchMod(mod);
  await writeConfig(join(scratch, 'config'), await realpath(work));
  const run = Bun.spawn([CLAUDE_BIN, '--plugin-dir', mod], {
    cwd: work,
    env: isolatedEnv(scratch),
    terminal: { cols: 120, rows: 40 },
  });
  const types = join(mod, '.claude-plugin', 'types');
  const written = await waitForTypes(types);
  run.kill();
  await run.exited;
  run.terminal?.close();
  if (!written) throw new Error(`${CLAUDE_BIN} wrote no declarations in ${TIMEOUT_MS} ms`);
  return types;
}

const scratch = await mkdtemp(join(tmpdir(), 'types-pull-'));
try {
  const from = await pull(scratch);
  await rm(TYPES_DIR, { recursive: true, force: true });
  for (const file of TYPES_FILES) {
    await mkdir(join(TYPES_DIR, file, '..'), { recursive: true });
    await copyFile(join(from, file), join(TYPES_DIR, file));
  }
  const head = (await readFile(join(TYPES_DIR, TYPES_FILES[0]), 'utf8')).split('\n', 1)[0] ?? '';
  const version = /Written by Claude Code (\d+\.\d+\.\d+)\./.exec(head)?.[1] ?? 'unknown';
  await writeFile(join(TYPES_DIR, 'VERSION'), `${version}\n`);
  console.log(`Claude Code ${version}: ${TYPES_FILES.length} declaration files`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
