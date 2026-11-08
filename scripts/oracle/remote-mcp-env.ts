/**
 * The remote MCP credential oracle: which `${VAR}` names Claude Code reads as empty in a remote
 * server's `url` and `headers` (mcp.md, "Credential variables that read as empty" lists them only
 * "such as"). Run as a black box: a project `.mcp.json` names one header per candidate, `claude mcp
 * get` connects to a local HTTP server, and the header values it receives say which names were
 * emptied. A covered name reads as empty whether or not it is set, so no variable is set: the run
 * gets a bare environment (no person's credential reaches the local server) and a private config
 * folder. No model is called.
 *
 * `bun run oracle:remote-mcp-env` rewrites tests/fixtures/remote-mcp-env/expected.json from the
 * candidates beside it; `--check` fails instead when they differ. `bun test` checks the kit's rule
 * against that file without running Claude Code.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { ROOT } from '../docs/location.ts';

export const REMOTE_MCP_ENV_DIR = join(ROOT, 'tests', 'fixtures', 'remote-mcp-env');
const CANDIDATES = join(REMOTE_MCP_ENV_DIR, 'candidates.txt');
const EXPECTED = join(REMOTE_MCP_ENV_DIR, 'expected.json');
/** Headers per run: a request with several hundred headers is not sent at all. */
const CHUNK = 150;

export const expectedSchema = z.object({
  claudeCodeVersion: z.string(),
  /** The candidates read as empty, sorted. */
  empty: z.array(z.string()),
  /** The candidates read as written (unset, so their `${...}` text stays), sorted. */
  kept: z.array(z.string()),
});
export type RemoteMcpEnvExpected = z.infer<typeof expectedSchema>;

async function claudeVersion(): Promise<string> {
  const run = Bun.spawn(['claude', '--version'], { stdout: 'pipe', stderr: 'ignore' });
  return (await new Response(run.stdout).text()).trim().split(' ')[0] ?? 'unknown';
}

/** The header values one `claude mcp get` sends for these names, by name. */
async function probe(names: readonly string[]): Promise<Map<string, string>> {
  const work = await mkdtemp(join(tmpdir(), 'kit-remote-mcp-env-'));
  const received = new Map<string, string>();
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(request) {
      names.forEach((name, index) => {
        const value = request.headers.get(`x-probe-${index}`);
        if (value !== null) received.set(name, value);
      });
      return new Response('not an MCP server', { status: 404 });
    },
  });
  try {
    const project = join(work, 'project');
    const config = join(work, 'config');
    await mkdir(project, { recursive: true });
    await mkdir(config, { recursive: true });
    await writeFile(
      join(config, 'settings.json'),
      JSON.stringify({ enableAllProjectMcpServers: true }),
    );
    const headers = Object.fromEntries(
      names.map((name, index) => [`x-probe-${index}`, `<\${${name}}>`]),
    );
    const url = `http://127.0.0.1:${server.port}/mcp`;
    await writeFile(
      join(project, '.mcp.json'),
      JSON.stringify({ mcpServers: { probe: { type: 'http', url, headers } } }),
    );
    const run = Bun.spawn(['claude', 'mcp', 'get', 'probe'], {
      cwd: project,
      env: { PATH: process.env.PATH ?? '', HOME: work, CLAUDE_CONFIG_DIR: config },
      stdout: 'ignore',
      stderr: 'ignore',
    });
    await run.exited;
  } finally {
    await server.stop(true);
    await rm(work, { recursive: true, force: true });
  }
  if (received.size !== names.length) {
    throw new Error(`claude sent ${received.size} of ${names.length} probe headers`);
  }
  return received;
}

export async function readCandidates(): Promise<string[]> {
  return (await readFile(CANDIDATES, 'utf8')).split('\n').filter((line) => line.trim() !== '');
}

export async function readExpected(): Promise<RemoteMcpEnvExpected> {
  return expectedSchema.parse(JSON.parse(await readFile(EXPECTED, 'utf8')));
}

async function main(): Promise<void> {
  const candidates = await readCandidates();
  const empty: string[] = [];
  const kept: string[] = [];
  for (let start = 0; start < candidates.length; start += CHUNK) {
    const names = candidates.slice(start, start + CHUNK);
    const received = await probe(names);
    for (const name of names) (received.get(name) === '<>' ? empty : kept).push(name);
  }
  const fresh: RemoteMcpEnvExpected = {
    claudeCodeVersion: await claudeVersion(),
    empty: empty.toSorted(),
    kept: kept.toSorted(),
  };
  const text = `${JSON.stringify(fresh, null, 2)}\n`;
  const previous = await readFile(EXPECTED, 'utf8').catch(() => '');
  const sameNames = (other: string) => {
    if (other === '') return false;
    const parsed = expectedSchema.parse(JSON.parse(other));
    return JSON.stringify(parsed.empty) === JSON.stringify(fresh.empty);
  };
  console.log(
    `${candidates.length} names: ${empty.length} empty, ${kept.length} kept (Claude Code ${fresh.claudeCodeVersion})`,
  );
  if (process.argv.includes('--check')) {
    if (!sameNames(previous)) {
      console.error('expected.json differs from Claude Code: run `bun run oracle:remote-mcp-env`');
      process.exit(1);
    }
    return;
  }
  await writeFile(EXPECTED, text);
}

if (import.meta.main) await main();
