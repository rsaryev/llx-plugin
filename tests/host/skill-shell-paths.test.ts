/**
 * The path variables of a skill's `!` command (skills.md, "Available string substitutions":
 * `${CLAUDE_SKILL_DIR}`, `${CLAUDE_PROJECT_DIR}`, and in a plugin skill `${CLAUDE_PLUGIN_ROOT}` and
 * `${CLAUDE_PLUGIN_DATA}` are substituted in "the skill's markdown content, and Bash rules in the
 * `allowed-tools` frontmatter"; "Use this in bash injection commands to reference scripts or files
 * bundled with the skill"; "Inject dynamic context": the command runs through the Bash tool).
 *
 * Judgment (spec/judgments.md, `shellPaths`): a path pasted into a command a shell parses runs any
 * `$(...)`, backtick or quote in a folder name, so by default the shell receives the braced reference
 * `${NAME}` with the value in its environment. The permission check judges the command with the
 * paths written in, as data: that is the text a rule of the settings or of `allowed-tools`
 * (substituted the same way) is written against. Proven by running what the public session hands
 * its runner through `sh -c` with a plugin and a project folder whose names are hostile.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPluginHost, type PluginHostOptions } from '../../src/host/index.ts';
import type { ShellCall } from '../../src/skills/index.ts';
import { fakeEnvironment, locations, scriptedRunner } from '../support/ports.ts';
import { loaded, SESSION, signal } from '../support/host.ts';

const ID = 'probe@acme-tools';
/** A folder name with each thing a shell parses: `$(...)`, backticks, both quotes, a space, `;`. */
const HOSTILE = 'x$(touch PWNED1)`touch PWNED2`"\'; touch PWNED3; y z';
const PRINT =
  'printf "[%s]" "${CLAUDE_SKILL_DIR}" "${CLAUDE_PLUGIN_ROOT}"/run.sh "${CLAUDE_PROJECT_DIR}" "${CLAUDE_PLUGIN_DATA}"';

async function sh(command: string, env: Readonly<Record<string, string>>, cwd: string) {
  const child = Bun.spawn(['sh', '-c', command], { env, cwd, stdout: 'pipe', stderr: 'pipe' });
  const [out] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  return out;
}

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kit-skill-shell-paths-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const root = () => `${dir}/${HOSTILE}/plugins/${ID}`;
const project = () => `${dir}/${HOSTILE}/project`;
const data = () => `${dir}/${HOSTILE}/data/probe-acme-tools`;
const pasted = () =>
  `printf "[%s]" "${root()}/skills/probe" "${root()}"/run.sh "${project()}" "${data()}"`;

async function hostWith(options: Partial<PluginHostOptions> = {}) {
  const plugin = await loaded({
    '.claude-plugin/plugin.json': JSON.stringify({ name: 'probe' }),
    'skills/probe/SKILL.md': [
      '---',
      'description: Prints its paths',
      'allowed-tools: Bash(printf "[%s]" "${CLAUDE_SKILL_DIR}" *)',
      '---',
      `Paths: !\`${PRINT}\``,
    ].join('\n'),
  });
  const runner = scriptedRunner({ stdout: 'printed' });
  const calls: ShellCall[] = [];
  const host = createPluginHost({
    plugins: [{ id: ID, plugin }],
    ports: {
      commands: runner,
      locations: locations({
        plugins: `${dir}/${HOSTILE}/plugins`,
        project: project(),
        data: `${dir}/${HOSTILE}/data`,
      }),
      environment: fakeEnvironment(),
    },
    ...options,
  });
  const session = host.openSession({
    ...SESSION,
    cwd: dir,
    shellPermission: (call) => {
      calls.push(call);
      return 'allow';
    },
  });
  const expansion = await session.expandSkill('probe:probe', { signal: signal() });
  if (!expansion.ok) throw new Error(JSON.stringify(expansion.issues));
  const [call] = runner.calls;
  if (call === undefined) throw new Error('the command did not run');
  return { call, calls, expansion };
}

describe("a hostile folder name in a skill's `!` command never runs as shell (judgment)", () => {
  test('the shell gets the braced references and their values in its environment', async () => {
    const { call } = await hostWith();
    expect(call.spec.command).toBe(PRINT);
    expect(await sh(call.spec.command, call.env, dir)).toBe(
      `[${root()}/skills/probe][${root()}/run.sh][${project()}][${data()}]`,
    );
    expect(await readdir(dir)).toEqual([]);
  });

  test('the permission check judges the command with the paths written in, as the grants are', async () => {
    const { calls, expansion } = await hostWith();
    expect(calls.map((one) => one.command)).toEqual([pasted()]);
    const grant = `Bash(printf "[%s]" "${root()}/skills/probe" *)`;
    expect(calls[0]?.grants).toEqual([grant]);
    expect(expansion.ok && expansion.grants).toEqual([grant]);
  });

  test("shellPaths 'pasted' is the docs' text: the shell gets the paths written in", async () => {
    const { call } = await hostWith({ shellPaths: 'pasted' });
    expect(call.spec.command).toBe(pasted());
  });

  test("the flaw, under shellPaths 'pasted': `$(...)` in a folder name runs inside the docs' double quotes", async () => {
    const { call } = await hostWith({ shellPaths: 'pasted' });
    // The same folder name with only its first part: `x$(touch PWNED1)`.
    await sh(call.spec.command.replaceAll(HOSTILE, 'x$(touch PWNED1)'), call.env, dir);
    expect(await readdir(dir)).toEqual(['PWNED1']);
  });
});
