/**
 * The arguments of a skill's `!` command (skills.md, "Available string substitutions", "Inject
 * dynamic context"; docs/SECURITY.md, "`$ARGUMENTS` in `!` blocks").
 *
 * Judgment (spec/judgments.md, `shellArguments`): under `PluginHostOptions.shellArguments:
 * 'environment-reference'` an argument holding shell syntax reaches the command as data. Proven by
 * running what the public session hands its runner through `sh -c`, in every quoting an author
 * writes around a placeholder.
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
const HOSTILE = `x$(touch PWNED1) \`touch PWNED2\` "'; touch PWNED3`;
const PRINT = `printf "[%s]" $ARGUMENTS "$ARGUMENTS" '$ARGUMENTS' $0 "$1"`;

async function sh(command: string, env: Readonly<Record<string, string>>, cwd: string) {
  const child = Bun.spawn(['sh', '-c', command], { env, cwd, stdout: 'pipe', stderr: 'pipe' });
  const [out] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  return out;
}

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kit-skill-shell-arguments-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function hostWith(options: Partial<PluginHostOptions>, args: string) {
  const plugin = await loaded({
    '.claude-plugin/plugin.json': JSON.stringify({ name: 'probe' }),
    'skills/probe/SKILL.md': [
      '---',
      'description: Prints its arguments',
      '---',
      `!\`${PRINT}\``,
    ].join('\n'),
  });
  const runner = scriptedRunner({ stdout: 'printed' });
  const calls: ShellCall[] = [];
  const host = createPluginHost({
    plugins: [{ id: ID, plugin }],
    ports: { commands: runner, locations: locations(), environment: fakeEnvironment() },
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
  const expansion = await session.expandSkill('probe:probe', { arguments: args, signal: signal() });
  if (!expansion.ok) throw new Error(JSON.stringify(expansion.issues));
  const [call] = runner.calls;
  if (call === undefined) throw new Error('the command did not run');
  return { call, calls };
}

describe("`!` command arguments under shellArguments 'environment-reference' (judgment)", () => {
  test('a hostile argument is printed in every quoting, and nothing it names runs', async () => {
    const { call, calls } = await hostWith(
      { shellArguments: 'environment-reference' },
      `'${HOSTILE.replaceAll("'", `'\\''`)}' two`,
    );
    const out = await sh(call.spec.command, call.env, dir);
    const typed = `'${HOSTILE.replaceAll("'", `'\\''`)}' two`;
    expect(out).toBe(`[${HOSTILE}][two][${typed}][${typed}][${HOSTILE}][two]`);
    expect(await readdir(dir)).toEqual([]);
    // What the rules read is the same command, each value quoted where it lands.
    const checked = calls[0]?.command ?? '';
    expect(await sh(checked, {}, dir)).toBe(out);
    expect(await readdir(dir)).toEqual([]);
  });

  test('by default the argument is pasted, as Claude Code does, and runs', async () => {
    const { call } = await hostWith({}, 'a; touch PWNED');
    expect(call.spec.command).toContain('a; touch PWNED');
  });
});
