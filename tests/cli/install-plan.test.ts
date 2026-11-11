/**
 * plugins/cli-reference.md § plugin install: the success line `Successfully installed plugin:
 * formatter@my-marketplace (scope: project)`; "Already installed at that scope: the output is `Plugin
 * "formatter@my-marketplace" is already installed (scope: project)` and the exit code is `0`"; "You
 * decline a command-source prompt: the output is `Aborted.` and the exit code is `1`"; "You decline a
 * `headersHelper` prompt, or it can't be confirmed without a TTY: the output is `Aborted — the command
 * was not run.`"; "stdin or stdout isn't a TTY, and you pass neither `-y` nor `--accept-command`: the
 * install is refused. The output says the command was only displayed, and the exit code is `1`";
 * `-s, --scope` "Defaults to `user`"; `-y, --yes` "Accept the displayed install command without the
 * `Run this command now?` prompt. Ignored when the command runs inside a Claude Code session";
 * `--json` ("Parse only that line, because Claude Code prints any command the marketplace declares
 * ahead of it"; a usage error "prints no result line and exits `1`"); plugins/install.md § Plugins
 * with dependencies. The wording of the refusals the docs do not quote is outside `spec(...)` and in
 * spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { PROMPT } from '../../src/cli/command-acceptance.ts';
import { startInstall } from '../../src/cli/install-start.ts';
import {
  COMMAND_ENTRY,
  contextOf,
  effectsOf,
  HEADERS_ENTRY,
  installed,
  lastJson,
  plugin,
  printed,
  run,
} from '../support/install.ts';
import { spec } from '../support/spec.ts';

const hooked = ['hooked@m', COMMAND_ENTRY] as const;
const helped = ['helped@m', HEADERS_ENTRY] as const;

const hookedSetup = { args: { plugin: 'hooked@m' }, catalog: [hooked] };
const helpedSetup = { args: { plugin: 'helped@m' }, catalog: [helped] };

spec('cli.plugin.plugin install', () => {
  test('installs the plugin and prints the success line with the scope', async () => {
    const found = await run({ args: { scope: 'project' } });
    expect(printed(found)).toEqual({
      stdout: ['Successfully installed plugin: formatter@m (scope: project)'],
      stderr: [],
      exitCode: 0,
    });
    expect(effectsOf(found)).toMatchObject({
      id: 'formatter@m',
      scope: 'project',
      install: true,
    });
  });

  test('already installed at that scope prints the exact line and exits 0', async () => {
    const found = await run({
      args: { scope: 'project' },
      have: [installed('formatter@m', { scope: 'project' })],
    });
    expect(printed(found)).toEqual({
      stdout: ['Plugin "formatter@m" is already installed (scope: project)'],
      stderr: [],
      exitCode: 0,
    });
    expect(effectsOf(found)).toBeUndefined();
  });

  test('installed at another scope only is not "already installed" here', async () => {
    const found = await run({
      args: { scope: 'project' },
      have: [installed('formatter@m', { scope: 'user' })],
    });
    expect(printed(found).stdout[0]).toStartWith('Successfully installed plugin');
  });

  test('a record whose directory is gone is installed again', async () => {
    const found = await run({
      args: { scope: 'user' },
      have: [installed('formatter@m', { scope: 'user' })],
      found: { installedCopyPresent: false },
    });
    expect(printed(found).stdout[0]).toStartWith('Successfully installed plugin');
  });

  test('a bare name is matched against the catalogs; one nobody lists is not found', async () => {
    const found = await run({ args: { plugin: 'formatter' } });
    expect(printed(found).stdout[0]).toContain('formatter@m');
    const missing = await run({ args: { plugin: 'nothing' } });
    expect(printed(missing)).toEqual({
      stdout: [],
      stderr: ['Plugin "nothing" not found in any configured marketplace'],
      exitCode: 1,
    });
  });

  test('a bare name two marketplaces offer is refused with the qualified commands', async () => {
    const found = await run({
      args: { plugin: 'formatter' },
      catalog: [
        plugin('formatter', { marketplace: 'a' }),
        plugin('formatter', { marketplace: 'b' }),
      ],
    });
    const out = printed(found);
    expect(out.exitCode).toBe(1);
    expect(out.stderr[0]).toContain('claude plugin install formatter@a');
    expect(out.stderr[0]).toContain('claude plugin install formatter@b');
  });

  test('its dependencies are installed with it, dependencies first', async () => {
    const found = await run({
      catalog: [plugin('formatter', { entry: ['lib'] }), plugin('lib')],
    });
    expect(effectsOf(found)?.steps.map((step) => step.id)).toEqual(['lib@m']);
  });

  test('a dependency its marketplace does not list refuses the install and installs nothing', async () => {
    const found = await run({ catalog: [plugin('formatter', { entry: ['lib'] })] });
    expect(printed(found).exitCode).toBe(1);
    expect(effectsOf(found)).toBeUndefined();
  });

  test('re-running it on an installed plugin plans its missing dependencies and still exits 0', async () => {
    const found = await run({
      catalog: [plugin('formatter', { entry: ['lib'] }), plugin('lib')],
      have: [installed('formatter@m', { scope: 'user', deps: ['lib'] })],
    });
    expect(printed(found).exitCode).toBe(0);
    expect(effectsOf(found)).toMatchObject({ install: false });
    expect(effectsOf(found)?.steps.map((step) => step.id)).toEqual(['lib@m']);
  });
});

spec('cli.plugin.plugin install.-s, --scope <scope>', () => {
  test('defaults to user', async () => {
    expect(printed(await run()).stdout[0]).toContain('(scope: user)');
  });

  test('installs at the scope named, project and local included', async () => {
    for (const scope of ['project', 'local'] as const) {
      const found = await run({ args: { scope } });
      expect(printed(found).stdout[0]).toContain(`(scope: ${scope})`);
    }
  });

  test('managed cannot be installed to: the command is refused as a usage error', async () => {
    const begun = startInstall({ plugin: 'formatter@m', scope: 'managed' }, contextOf());
    expect(begun).toMatchObject({ kind: 'done', output: { kind: 'usage-error' } });
  });

  test('the dependency plan is made at that scope', async () => {
    const found = await run({
      args: { scope: 'project' },
      catalog: [plugin('formatter', { entry: ['lib'] }), plugin('lib')],
    });
    expect(effectsOf(found)?.scope).toBe('project');
  });
});

describe('a command-source entry', () => {
  test('prints the command first and, with no terminal and neither -y nor --accept-command, refuses with exit 1', async () => {
    const found = await run(hookedSetup);
    const out = printed(found);
    expect(out.stdout).toEqual(['node build.js']);
    expect(out.exitCode).toBe(1);
    expect(out.stderr[0]).toContain('only displayed');
    expect(effectsOf(found)).toBeUndefined();
  });

  test('at a terminal asks Run this command now? [y/N] after printing the command', async () => {
    const found = await run({ ...hookedSetup, context: { tty: true } });
    expect(found).toEqual({ before: ['node build.js'], prompt: PROMPT });
    expect(PROMPT).toBe('Run this command now? [y/N]');
  });

  test('a yes at the prompt installs it; a no prints Aborted. and exits 1', async () => {
    const yes = await run({ ...hookedSetup, context: { tty: true }, found: { answer: true } });
    expect(printed(yes).exitCode).toBe(0);
    const no = await run({ ...hookedSetup, context: { tty: true }, found: { answer: false } });
    expect(printed(no)).toMatchObject({ stderr: ['Aborted.'], exitCode: 1 });
  });
});

describe('a headersHelper entry', () => {
  test('declined prints Aborted — the command was not run. and exits 1', async () => {
    const no = await run({ ...helpedSetup, context: { tty: true }, found: { answer: false } });
    expect(printed(no)).toMatchObject({
      stderr: ['Aborted — the command was not run.'],
      exitCode: 1,
    });
  });

  test('that cannot be confirmed without a terminal prints the same line and exits 1', async () => {
    const found = await run(helpedSetup);
    expect(printed(found)).toMatchObject({
      stdout: ['/opt/mint.sh'],
      stderr: ['Aborted — the command was not run.'],
      exitCode: 1,
    });
  });

  test('wins over a command source when an entry has both', async () => {
    const both = { ...COMMAND_ENTRY, headersHelper: '/opt/mint.sh' };
    const found = await run({ args: { plugin: 'hooked@m' }, catalog: [['hooked@m', both]] });
    expect(printed(found).stderr[0]).toBe('Aborted — the command was not run.');
  });
});

spec('cli.plugin.plugin install.-y, --yes', () => {
  test('accepts the displayed command without the prompt', async () => {
    const found = await run({ ...hookedSetup, args: { plugin: 'hooked@m', yes: true } });
    expect(printed(found)).toMatchObject({
      stdout: ['Successfully installed plugin: hooked@m (scope: user)'],
      exitCode: 0,
    });
  });

  test('accepts it even when stdin or stdout is not a terminal', async () => {
    const found = await run({
      ...helpedSetup,
      args: { plugin: 'helped@m', yes: true },
      context: { tty: false },
    });
    expect(printed(found).exitCode).toBe(0);
  });

  test('is ignored when the command runs inside a Claude Code session', async () => {
    const found = await run({
      ...hookedSetup,
      args: { plugin: 'hooked@m', yes: true },
      context: { session: true },
    });
    expect(printed(found).exitCode).toBe(1);
    expect(effectsOf(found)).toBeUndefined();
  });

  test('is ignored in a session even at a terminal: the question is still asked', async () => {
    const found = await run({
      ...hookedSetup,
      args: { plugin: 'hooked@m', yes: true },
      context: { session: true, tty: true },
    });
    expect(found).toMatchObject({ prompt: PROMPT });
  });

  test('changes nothing for a plugin with no command to accept', async () => {
    const found = await run({ args: { yes: true } });
    expect(printed(found).exitCode).toBe(0);
  });
});

spec('cli.plugin.plugin install.--json', () => {
  test('the last line is one object with command, outcome, message, pluginId and scope', async () => {
    expect(lastJson(await run({ args: { json: true, scope: 'project' } }))).toEqual({
      command: 'install',
      outcome: 'ok',
      pluginId: 'formatter@m',
      scope: 'project',
      message: 'Successfully installed plugin: formatter@m (scope: project)',
    });
  });

  test('the command the marketplace declares is printed ahead of the result line', async () => {
    const found = await run({ ...hookedSetup, args: { plugin: 'hooked@m', json: true } });
    const out = printed(found, true).stdout;
    expect(out[0]).toBe('node build.js');
    expect(JSON.parse(out.at(-1) ?? '')).toMatchObject({ outcome: 'failed', command: 'install' });
  });

  test('a refused command carries a shownCommand with the command, the plugin and the sha256', async () => {
    const found = await run({ ...hookedSetup, args: { plugin: 'hooked@m', json: true } });
    expect(lastJson(found)['shownCommand']).toMatchObject({
      command: 'node build.js',
      plugin: 'hooked@m',
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  test('a usage error such as an invalid --scope prints no result line', async () => {
    const begun = startInstall({ plugin: 'formatter@m', scope: 'team', json: true }, contextOf());
    expect(begun).toMatchObject({ kind: 'done', output: { kind: 'usage-error' } });
  });
});
