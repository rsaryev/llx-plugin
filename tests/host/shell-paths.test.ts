/**
 * What a session hands a shell (plugins/manifest-reference.md, "Where each variable resolves",
 * "Quoting and path separators": "wrap the variable in double quotes so a path with spaces stays one
 * word"; plugins/components.md, "Monitors": "The command runs in a shell"; hooks.md, "Exec form and
 * shell form": shell form "needs quoting to handle paths with spaces or special characters", and
 * "Reference scripts by path in PowerShell hooks": Claude Code rewrites the placeholders to
 * `${env:NAME}` and "PowerShell then resolves the value from the exported environment after
 * parsing"; mcp.md, "Use dynamic headers": a `headersHelper` "runs through a shell").
 *
 * Judgment (spec/judgments.md, `shellPaths`): double quotes do not keep `$(...)`, a backtick or a
 * quote in a pasted path from being parsed, so by default a session writes the three path variables
 * of a shell-run string as the braced reference `${NAME}` and puts the values in the process
 * environment, as Claude Code does for PowerShell. Proven by running what the public session returns
 * through `sh -c` with a project and a plugin folder whose names are hostile.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPluginHost, type PluginHostOptions } from '../../src/host/index.ts';
import { planHeadersHelper } from '../../src/loading/index.ts';
import { fakeEnvironment, locations, scriptedRunner } from '../support/ports.ts';
import { TRUSTED } from '../support/headers-helper.ts';
import { loaded, SESSION, signal } from '../support/host.ts';

const ID = 'probe@acme-tools';
/** A folder name with each thing a shell parses: `$(...)`, backticks, both quotes, a space, `;`. */
const HOSTILE = 'x$(touch PWNED1)`touch PWNED2`"\'; touch PWNED3; y z';
const PRINT = 'printf "[%s]" "${CLAUDE_PLUGIN_ROOT}"/run.sh "${CLAUDE_PROJECT_DIR}"';

async function sh(command: string, env: Readonly<Record<string, string>>, cwd: string) {
  const child = Bun.spawn(['sh', '-c', command], { env, cwd, stdout: 'pipe', stderr: 'pipe' });
  const [out] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  return out;
}

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kit-shell-paths-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const root = () => `${dir}/${HOSTILE}/plugins/${ID}`;
const project = () => `${dir}/${HOSTILE}/project`;
const expected = () => `[${root()}/run.sh][${project()}]`;

async function hostWith(options: Partial<PluginHostOptions> = {}) {
  const plugin = await loaded({
    '.claude-plugin/plugin.json': JSON.stringify({
      name: 'probe',
      mcpServers: { api: { type: 'http', url: 'https://mcp.example', headersHelper: PRINT } },
    }),
    'monitors/monitors.json': JSON.stringify([
      { name: 'probe', command: PRINT, description: 'Prints its paths' },
    ]),
    'hooks/hooks.json': JSON.stringify({
      hooks: { SessionStart: [{ hooks: [{ type: 'command', command: PRINT }] }] },
    }),
  });
  const runner = scriptedRunner({});
  const host = createPluginHost({
    plugins: [{ id: ID, plugin }],
    ports: {
      commands: runner,
      locations: {
        ...locations({ plugins: `${dir}/${HOSTILE}/plugins`, project: project() }),
        existingDirectory: (candidates) => Promise.resolve(candidates[0]),
      },
      environment: fakeEnvironment(),
    },
    ...options,
  });
  return { session: host.openSession({ ...SESSION, cwd: dir }), runner };
}

describe('a hostile project or plugin folder name never runs as shell (judgment)', () => {
  test('a monitor command, run with the environment the session gives it', async () => {
    const { session } = await hostWith();
    const { resolved, issues } = await session.monitorsToStart();
    expect(issues).toEqual([]);
    const [start] = resolved;
    if (start === undefined) throw new Error('the monitor did not start');
    expect(await sh(start.monitor.command, start.env, start.cwd)).toBe(expected());
    expect(await readdir(dir)).toEqual([]);
  });

  test('a shell-form plugin hook, run as the session hands it to the runner', async () => {
    const { session, runner } = await hostWith();
    await session.dispatch('SessionStart', { source: 'startup' }, { signal: signal() });
    const [call] = runner.calls;
    if (call === undefined) throw new Error('the hook did not run');
    expect(await sh(call.spec.command, call.env, dir)).toBe(expected());
    expect(await readdir(dir)).toEqual([]);
  });

  test("an MCP server's headersHelper, run with the environment its plan gives it", async () => {
    const { session } = await hostWith();
    const { resolved } = await session.mcpServers();
    const helper = resolved[0]?.headersHelper;
    if (helper === undefined) throw new Error('the server has no helper');
    const plan = planHeadersHelper(helper, 'plugin', TRUSTED, {
      environment: {},
      locations: locations(),
      projectDirectory: dir,
      primaryDirectory: dir,
      pluginRoot: root(),
    });
    if (!plan.run) throw new Error('the helper does not run');
    // Its directory is the plugin root, which this test does not create: run it in `dir`.
    expect(await sh(plan.command, plan.environment, dir)).toBe(expected());
    expect(await readdir(dir)).toEqual([]);
  });

  test("shellPaths 'pasted' is the docs' text: the host that asks for it gets the path written in", async () => {
    const { session } = await hostWith({ shellPaths: 'pasted' });
    const { resolved } = await session.monitorsToStart();
    expect(resolved[0]?.monitor.command).toBe(`printf "[%s]" "${root()}"/run.sh "${project()}"`);
    expect(resolved[0]?.monitor.environment).toEqual({});
  });

  test("the flaw, under shellPaths 'pasted': `$(...)` in a folder name runs inside the docs' double quotes", async () => {
    const { session } = await hostWith({ shellPaths: 'pasted' });
    const { resolved } = await session.monitorsToStart();
    const [start] = resolved;
    if (start === undefined) throw new Error('the monitor did not start');
    // The same folder name with only its first part: `x$(touch PWNED1)`.
    const pasted = start.monitor.command.replaceAll(HOSTILE, 'x$(touch PWNED1)');
    await sh(pasted, start.env, dir);
    expect(await readdir(dir)).toEqual(['PWNED1']);
  });
});
