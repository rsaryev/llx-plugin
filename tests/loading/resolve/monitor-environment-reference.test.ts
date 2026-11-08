/**
 * plugins/manifest-reference.md § Quoting and path separators ("Shell-form hooks and monitor
 * commands: wrap the variable in double quotes so a path with spaces stays one word"; on Windows
 * "most substituted paths use forward slashes ... They keep their native backslashes in an exec-form
 * hook and in a hook that runs through PowerShell"); § Where each variable resolves (monitor
 * `command`: "Anywhere in `command`", "Not exported").
 *
 * The opt-in `monitorPaths: 'environment-reference'` is the kit's (spec/judgments.md): the command
 * names the three path variables as shell environment references and the process environment
 * supplies the values, so a path with shell metacharacters is never parsed as shell. Run through a
 * shell with that environment it is the same command line as the documented pasted form.
 */
import { describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveHookCommand,
  resolveMonitor,
  substituteSurface,
  type Surface,
} from '../../../src/loading/resolve/index.ts';
import type { Monitor, SubstitutionScope } from '../../../src/index.ts';
import { locations } from '../../support/ports.ts';
import { PATHS, scopeOf } from '../../support/mcp-scope.ts';
import { windowsLocations } from '../../support/windows-locations.ts';
import { spec } from '../../support/spec.ts';

const monitor = (command: string): Monitor => ({
  name: 'deploy-status',
  command,
  description: 'Deployment status changes',
  when: { kind: 'always' },
});

const reference = (overrides: Partial<SubstitutionScope> = {}): SubstitutionScope =>
  scopeOf({ monitorPaths: 'environment-reference', ...overrides });

const resolve = async (command: string, scope: SubstitutionScope) => {
  const { resolved, issues } = await resolveMonitor(monitor(command), scope);
  expect(issues).toEqual([]);
  if (!resolved) throw new Error('the monitor did not resolve');
  return resolved;
};

/** Runs a command line through `sh -c` and returns its stdout. */
async function sh(command: string, env: Record<string, string>, cwd: string): Promise<string> {
  const child = Bun.spawn(['sh', '-c', command], { env, cwd, stdout: 'pipe', stderr: 'pipe' });
  const [out] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  return out;
}

const text = (surface: Surface, template: string, scope: SubstitutionScope): Promise<string> =>
  substituteSurface(surface, template, scope).then((done) => done.text);

spec('environment.rule.Quoting and path separators', () => {
  const windows = scopeOf({ locations: windowsLocations(), windows: true });
  const NATIVE = 'C:\\Users\\you\\.claude\\plugins\\cache\\my-plugin@acme-tools';
  const FORWARD = 'C:/Users/you/.claude/plugins/cache/my-plugin@acme-tools';

  test('on Windows a shell-form hook and a monitor command get forward slashes', async () => {
    const quoted = '"${CLAUDE_PLUGIN_ROOT}"/scripts/process.sh';
    expect(await text('hook-shell', quoted, windows)).toBe(`"${FORWARD}"/scripts/process.sh`);
    expect(await text('monitor-command', quoted, windows)).toBe(`"${FORWARD}"/scripts/process.sh`);
  });

  test('an exec-form hook keeps its native backslashes', async () => {
    expect(await text('hook-exec', '${CLAUDE_PLUGIN_ROOT}', windows)).toBe(NATIVE);
  });

  test('a PowerShell hook keeps the native backslashes: the placeholder is the environment reference and the exported value is the native path', async () => {
    const resolution = await resolveHookCommand(
      { type: 'command', command: '& "${CLAUDE_PLUGIN_ROOT}\\run.ps1"', shell: 'powershell' },
      windows,
    );
    expect(resolution.resolved?.spec).toEqual({
      form: 'shell',
      command: '& "${env:CLAUDE_PLUGIN_ROOT}\\run.ps1"',
      shell: 'powershell',
    });
    expect(resolution.resolved?.environment.CLAUDE_PLUGIN_ROOT).toBe(NATIVE);
  });

  test('an exec-form hook passes each path as one argument with no quoting', async () => {
    const spaced = scopeOf({ locations: locations({ plugins: '/my plugins' }) });
    const resolution = await resolveHookCommand(
      { type: 'command', command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/a b.js'] },
      spaced,
    );
    expect(resolution.resolved?.spec).toEqual({
      form: 'exec',
      command: 'node',
      args: ['/my plugins/my-plugin@acme-tools/a b.js'],
    });
  });

  test('a shell-form path in double quotes stays one word, an unquoted one with a space does not', async () => {
    const spaced = scopeOf({ locations: locations({ plugins: '/my plugins' }) });
    const cwd = tmpdir();
    const quoted = await resolve('printf \'[%s]\' "${CLAUDE_PLUGIN_ROOT}"/run.sh', spaced);
    expect(await sh(quoted.command, {}, cwd)).toBe('[/my plugins/my-plugin@acme-tools/run.sh]');
    const bare = await resolve("printf '[%s]' ${CLAUDE_PLUGIN_ROOT}/run.sh", spaced);
    expect(await sh(bare.command, {}, cwd)).toBe('[/my][plugins/my-plugin@acme-tools/run.sh]');
  });
});

spec('environment.component.Monitor commands', () => {
  const everywhere = '${CLAUDE_PLUGIN_ROOT}|${CLAUDE_PLUGIN_DATA}|${CLAUDE_PROJECT_DIR}';

  test('the documented pasted form stays the default', async () => {
    const { resolved } = await resolveMonitor(
      monitor('"${CLAUDE_PLUGIN_ROOT}"/poll.sh'),
      scopeOf(),
    );
    expect(resolved?.command).toBe(`"${PATHS.CLAUDE_PLUGIN_ROOT}"/poll.sh`);
    expect(resolved?.environment).toEqual({});
  });

  test('no configured option is exported to the monitor: the pasted form carries no environment', async () => {
    const { resolved } = await resolveMonitor(monitor(`echo ${everywhere}`), scopeOf());
    expect(resolved?.command).toBe(
      `echo ${PATHS.CLAUDE_PLUGIN_ROOT}|${PATHS.CLAUDE_PLUGIN_DATA}|${PATHS.CLAUDE_PROJECT_DIR}`,
    );
    expect(resolved?.environment).toEqual({});
  });

  test('${ENV_VAR} and its default expand, and user_config is refused', async () => {
    const { resolved, issues } = await resolveMonitor(
      monitor('psql ${DB_URL} -c "${QUERY:-select 1}"'),
      scopeOf(),
    );
    expect(issues).toEqual([]);
    expect(resolved?.command).toBe('psql postgres://db -c "select 1"');
    const refused = await resolveMonitor(monitor('./poll.sh ${user_config.region}'), scopeOf());
    expect(refused.resolved).toBeUndefined();
  });
});

describe("monitorPaths: environment-reference (judgment, the kit's opt-in)", () => {
  const everywhere = '${CLAUDE_PLUGIN_ROOT}|${CLAUDE_PLUGIN_DATA}|${CLAUDE_PROJECT_DIR}';

  test('the command names the variables and the environment carries the values', async () => {
    const resolved = await resolve(`echo ${everywhere}`, reference());
    expect(resolved.command).toBe(
      'echo ${CLAUDE_PLUGIN_ROOT}|${CLAUDE_PLUGIN_DATA}|${CLAUDE_PROJECT_DIR}',
    );
    expect(resolved.environment).toEqual(PATHS);
  });

  test('only the variables the command references are exported, so the data folder is created on demand', async () => {
    const host = locations();
    const resolved = await resolve('"${CLAUDE_PLUGIN_ROOT}"/a', reference({ locations: host }));
    expect(resolved.environment).toEqual({ CLAUDE_PLUGIN_ROOT: PATHS.CLAUDE_PLUGIN_ROOT });
    expect(host.dataCreated).toEqual([]);
    await resolve('"${CLAUDE_PLUGIN_DATA}"/a', reference({ locations: host }));
    expect(host.dataCreated).toEqual(['my-plugin-acme-tools']);
  });

  test('no configured option reaches the monitor in the reference form either', async () => {
    const resolved = await resolve(`echo ${everywhere}`, reference());
    expect(
      Object.keys(resolved.environment).some((name) => name.startsWith('CLAUDE_PLUGIN_OPTION_')),
    ).toBe(false);
  });

  test('${ENV_VAR} and its default expand as before, and user_config is still refused', async () => {
    const resolved = await resolve('psql ${DB_URL} -c "${QUERY:-select 1}"', reference());
    expect(resolved.command).toBe('psql postgres://db -c "select 1"');
    const refused = await resolveMonitor(monitor('./poll.sh ${user_config.region}'), reference());
    expect(refused.resolved).toBeUndefined();
  });

  test('a variable followed by text is not read as a longer name: the reference is braced', async () => {
    const resolved = await resolve('"${CLAUDE_PLUGIN_ROOT}"_old/run', reference());
    expect(resolved.command).toBe('"${CLAUDE_PLUGIN_ROOT}"_old/run');
  });
});

describe('the environment reference is the pasted form, run (judgment, tested with sh)', () => {
  const templates = [
    'printf "[%s]" "${CLAUDE_PLUGIN_ROOT}"/scripts/poll.sh',
    'printf "[%s]" "a=${CLAUDE_PLUGIN_ROOT}" "${CLAUDE_PROJECT_DIR}" "${CLAUDE_PLUGIN_DATA}"',
    'printf "[%s]" "${CLAUDE_PLUGIN_ROOT}"_old "${CLAUDE_PLUGIN_ROOT}"/x',
  ];

  test('the same words come out with the environment applied as with the path pasted in', async () => {
    const host = locations({ plugins: '/p dir', data: '/d dir', project: '/pr dir' });
    for (const template of templates) {
      const pasted = await resolve(template, scopeOf({ locations: host }));
      const referenced = await resolve(template, reference({ locations: host }));
      expect(referenced.command).not.toBe(pasted.command);
      const [one, two] = await Promise.all([
        sh(pasted.command, {}, tmpdir()),
        sh(referenced.command, referenced.environment, tmpdir()),
      ]);
      expect(one).toContain('[');
      expect(two).toBe(one);
    }
  });

  test('a path with shell metacharacters stays inert as a reference, and runs as shell when pasted', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kit-monitor-'));
    try {
      const hostile = `${dir}/$(touch injected);x`;
      const host = { ...locations(), pluginRoot: () => hostile };
      const probe = 'printf "[%s]" "${CLAUDE_PLUGIN_ROOT}"/run.sh';

      const safe = await resolve(probe, reference({ locations: host }));
      const out = await sh(safe.command, safe.environment, dir);
      expect(out).toBe(`[${hostile}/run.sh]`);
      expect(await readdir(dir)).toEqual([]);

      const pasted = await resolve(probe, scopeOf({ locations: host }));
      await sh(pasted.command, {}, dir);
      expect(await readdir(dir)).toEqual(['injected']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('a path with a double quote or a backtick does not break out either', async () => {
    const hostile = '/x"; echo breakout; "`id`';
    const host = { ...locations(), pluginRoot: () => hostile };
    const safe = await resolve(
      'printf "[%s]" "${CLAUDE_PLUGIN_ROOT}"',
      reference({ locations: host }),
    );
    expect(await sh(safe.command, safe.environment, tmpdir())).toBe(`[${hostile}]`);
  });

  test('on a Windows host the environment still carries the native path', async () => {
    const resolved = await resolve(
      '"${CLAUDE_PLUGIN_ROOT}"/run.sh',
      reference({ locations: windowsLocations(), windows: true }),
    );
    expect(resolved.command).toBe('"${CLAUDE_PLUGIN_ROOT}"/run.sh');
    expect(resolved.environment.CLAUDE_PLUGIN_ROOT).toBe(
      'C:\\Users\\you\\.claude\\plugins\\cache\\my-plugin@acme-tools',
    );
  });
});
