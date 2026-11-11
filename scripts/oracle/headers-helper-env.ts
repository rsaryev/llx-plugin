/**
 * The headersHelper environment oracle: which variables Claude Code removes from the environment of
 * a `headersHelper` a project `.mcp.json` supplies (mcp.md, "Which variables a helper can read"
 * gives the rule by example). Run as a black box: every candidate is set to a dummy value (a proxy
 * to an address `NO_PROXY` bypasses), a trusted private project names one server whose helper prints
 * the names it received as a header, `claude mcp get` connects to a local HTTP server, and the names
 * that did not arrive were removed. The run gets a bare environment and a private config folder, so
 * no person's credential is set; no model is called.
 *
 * `bun run oracle:headers-helper-env` rewrites tests/fixtures/headers-helper-env/expected.json;
 * `--check` fails instead when Claude Code removes other names. `bun test` checks the kit's rule
 * against that file without running Claude Code.
 */
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { ROOT } from '../docs/location.ts';
import { CLAUDE_BIN, claudeVersion } from './claude-bin.ts';

const DIR = join(ROOT, 'tests', 'fixtures', 'headers-helper-env');
const CANDIDATES = join(DIR, 'candidates.txt');
const EXPECTED = join(DIR, 'expected.json');
const PROXY = /proxy$/i;
const UNUSED_PROXY = 'http://127.0.0.1:9';

export const helperExpectedSchema = z.object({
  claudeCodeVersion: z.string(),
  removed: z.array(z.string()),
  kept: z.array(z.string()),
});
export type HelperEnvExpected = z.infer<typeof helperExpectedSchema>;

export async function readHelperCandidates(): Promise<string[]> {
  return (await readFile(CANDIDATES, 'utf8')).split('\n').filter((line) => line.trim() !== '');
}

export async function readHelperExpected(): Promise<HelperEnvExpected> {
  return helperExpectedSchema.parse(JSON.parse(await readFile(EXPECTED, 'utf8')));
}

/** A candidate's dummy value: a proxy must parse as a URL or Claude Code refuses to start. */
const valueOf = (name: string): string => {
  if (/^no_proxy$/i.test(name)) return '127.0.0.1,localhost';
  return PROXY.test(name) && !/^goproxy$/i.test(name) ? UNUSED_PROXY : 'v';
};

/** The names the helper received. */
async function probe(names: readonly string[]): Promise<Set<string>> {
  const work = await realpath(await mkdtemp(join(tmpdir(), 'kit-helper-env-')));
  let received: string | undefined;
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(request) {
      received ??= request.headers.get('x-names') ?? undefined;
      return new Response('not an MCP server', { status: 404 });
    },
  });
  try {
    const project = join(work, 'project');
    const config = join(work, 'config');
    await mkdir(project, { recursive: true });
    await mkdir(config, { recursive: true });
    const helper = join(project, 'helper.sh');
    await writeFile(
      helper,
      `#!/bin/sh\nprintf '{"x-names":"%s"}' "$(env | cut -d= -f1 | tr '\\n' ',')"\n`,
    );
    await chmod(helper, 0o755);
    const url = `http://127.0.0.1:${server.port}/mcp`;
    await writeFile(
      join(project, '.mcp.json'),
      JSON.stringify({ mcpServers: { probe: { type: 'http', url, headersHelper: helper } } }),
    );
    await writeFile(
      join(config, 'settings.json'),
      JSON.stringify({ enableAllProjectMcpServers: true }),
    );
    await writeFile(
      join(config, '.claude.json'),
      JSON.stringify({ projects: { [project]: { hasTrustDialogAccepted: true } } }),
    );
    const env: Record<string, string> = Object.fromEntries(
      names.map((name) => [name, valueOf(name)]),
    );
    const run = Bun.spawn([CLAUDE_BIN, 'mcp', 'get', 'probe'], {
      cwd: project,
      env: { ...env, PATH: process.env.PATH ?? '', HOME: work, CLAUDE_CONFIG_DIR: config },
      stdout: 'ignore',
      stderr: 'ignore',
    });
    await run.exited;
  } finally {
    await server.stop(true);
    await rm(work, { recursive: true, force: true });
  }
  if (received === undefined) throw new Error('the headersHelper never reached the local server');
  return new Set(received.split(','));
}

async function main(): Promise<void> {
  const candidates = await readHelperCandidates();
  const got = await probe(candidates);
  const fresh: HelperEnvExpected = {
    claudeCodeVersion: (await claudeVersion()) ?? 'unknown',
    removed: candidates.filter((name) => !got.has(name)).toSorted(),
    kept: candidates.filter((name) => got.has(name)).toSorted(),
  };
  console.log(
    `${candidates.length} names: ${fresh.removed.length} removed, ${fresh.kept.length} kept (Claude Code ${fresh.claudeCodeVersion})`,
  );
  if (process.argv.includes('--check')) {
    const previous = await readHelperExpected().catch(() => undefined);
    if (JSON.stringify(previous?.removed) !== JSON.stringify(fresh.removed)) {
      console.error(
        'expected.json differs from Claude Code: run `bun run oracle:headers-helper-env`',
      );
      process.exit(1);
    }
    return;
  }
  await writeFile(EXPECTED, `${JSON.stringify(fresh, null, 2)}\n`);
}

if (import.meta.main) await main();
