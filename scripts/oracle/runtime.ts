/**
 * The runtime oracle: what a Claude Code SESSION registers from a plugin, read from the `init`
 * event of `claude -p --plugin-dir <fixture> --output-format stream-json --verbose` run as a black
 * box (never reading the program). An invalid API key makes the model call fail, so the run costs
 * nothing; the config folder and the working folder are private, so no person's settings, plugins
 * or project play a part.
 *
 * This RUNS the plugin's hooks and MCP servers: point it only at fixtures written for this
 * purpose (tests/fixtures/runtime), never at a third-party or corpus plugin.
 */
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { z } from 'zod';
import { ROOT } from '../docs/location.ts';

export const RUNTIME_ORACLE_DIR = join(ROOT, '.cache', 'oracle-runtime');

/** The fields of `init` the comparison reads; the event has more, which a release may change. */
const initSchema = z.object({
  type: z.literal('system'),
  subtype: z.literal('init'),
  claude_code_version: z.string(),
  agents: z.array(z.string()),
  slash_commands: z.array(z.string()),
  skills: z.array(z.string()),
  mcp_servers: z.array(z.object({ name: z.string(), status: z.string() }).loose()),
  plugins: z.array(z.object({ name: z.string() }).loose()),
  output_style: z.string(),
});
export type RuntimeInit = z.infer<typeof initSchema>;

/** The first `init` event of a stream-json transcript, if there is one. */
export function parseInit(stdout: string): RuntimeInit | undefined {
  for (const line of stdout.split('\n')) {
    if (!line.includes('"init"')) continue;
    try {
      const parsed = initSchema.safeParse(JSON.parse(line));
      if (parsed.success) return parsed.data;
    } catch {
      // not a JSON line
    }
  }
  return undefined;
}

/** What the oracle's results are stored in, beside the fixture: never part of its content. */
export const EXPECTED_FILE = 'expected.json';
/** Settings the fixture runs under: copied to the private config folder as `settings.json`. */
export const SETTINGS_FILE = 'oracle-settings.json';

async function filesOf(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name !== EXPECTED_FILE)
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .toSorted();
}

/** The hash of a folder's content: every file's relative path and bytes, in path order. */
export async function fixtureHash(dir: string): Promise<string> {
  const hash = createHash('sha256');
  for (const file of await filesOf(dir)) {
    hash.update(`${file}\0`);
    hash.update(await readFile(join(dir, file)));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}

export async function claudeVersion(): Promise<string | undefined> {
  try {
    const run = Bun.spawn(['claude', '--version'], { stdout: 'pipe', stderr: 'ignore' });
    const text = await new Response(run.stdout).text();
    await run.exited;
    return /^(\d+\.\d+\.\d+)/.exec(text.trim())?.[1];
  } catch {
    return undefined;
  }
}

const TIMEOUT_MS = 120_000;

/** One run of `claude -p` over the fixture; `undefined` when no `init` event came. */
async function runClaude(fixture: string): Promise<RuntimeInit | undefined> {
  const scratch = await mkdtemp(join(tmpdir(), 'runtime-oracle-'));
  try {
    const settings = await readFile(join(fixture, SETTINGS_FILE), 'utf8').catch(() => undefined);
    if (settings !== undefined) {
      await mkdir(join(scratch, 'config'), { recursive: true });
      await writeFile(join(scratch, 'config', 'settings.json'), settings);
    }
    const run = Bun.spawn(
      [
        'claude',
        '-p',
        '--plugin-dir',
        fixture,
        '--output-format',
        'stream-json',
        '--verbose',
        '--max-turns',
        '1',
        'hi',
      ],
      {
        cwd: scratch,
        env: {
          ...process.env,
          CLAUDE_CONFIG_DIR: join(scratch, 'config'),
          ANTHROPIC_API_KEY: 'sk-ant-invalid-for-oracle',
        },
        stdout: 'pipe',
        stderr: 'ignore',
      },
    );
    const timer = setTimeout(() => run.kill(), TIMEOUT_MS);
    const out = await new Response(run.stdout).text();
    await run.exited;
    clearTimeout(timer);
    return parseInit(out);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

/**
 * The `init` event for a fixture folder, cached under `.cache/oracle-runtime/<version>/` by the
 * folder's content hash. `undefined` when `claude` is not installed or printed no `init`.
 */
export async function runtimeOracle(fixture: string): Promise<RuntimeInit | undefined> {
  const version = await claudeVersion();
  if (version === undefined) return undefined;
  const cacheDir = join(RUNTIME_ORACLE_DIR, version);
  const cached = join(cacheDir, `${await fixtureHash(fixture)}.json`);
  try {
    return initSchema.parse(JSON.parse(await readFile(cached, 'utf8')));
  } catch {
    // not cached yet
  }
  const init = await runClaude(fixture);
  if (init === undefined) return undefined;
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cached, `${JSON.stringify(init)}\n`);
  return init;
}

/**
 * What a plugin registered, ids only: the names that belong to the plugin, sorted. `outputStyle` is
 * the session's: `init` echoes the `outputStyle` setting, whether or not the style exists.
 */
export interface Registry {
  /** Whether the plugin is among the session's plugins at all. */
  readonly loaded: boolean;
  readonly agents: readonly string[];
  readonly slashCommands: readonly string[];
  readonly skills: readonly string[];
  readonly mcpServers: readonly string[];
  readonly outputStyle: string;
}

const own = (plugin: string) => (name: string) => name === plugin || name.startsWith(`${plugin}:`);

/** The oracle's registry of one plugin: the `init` names filtered to the plugin's own. */
export function registryOf(init: RuntimeInit, plugin: string): Registry {
  const mine = own(plugin);
  return {
    loaded: init.plugins.some((one) => one.name === plugin),
    agents: init.agents.filter(mine).toSorted(),
    slashCommands: init.slash_commands.filter(mine).toSorted(),
    skills: init.skills.filter(mine).toSorted(),
    mcpServers: init.mcp_servers
      .map((server) => server.name)
      .filter((name) => name.startsWith(`plugin:${plugin}:`))
      .toSorted(),
    outputStyle: init.output_style,
  };
}
