/**
 * plugins/mods/overview.md § Where mods run (the table of where Claude Code runs: whether hooks run
 * and whether what a mod draws appears) and § Turn mods on or off (the versions that load mods),
 * plugins/mods/troubleshoot.md § Your version is too old, § A `claude -p` run prints `hooks module not
 * loaded` and § Find out why a mod does nothing (where the line is read). The wording of a refusal
 * that names the place is ours (spec/judgments.md).
 */
import { expect, test } from 'bun:test';
import {
  decideModLoad,
  modLineChannel,
  modsVersionProblem,
  versionAtLeast,
  whereModsRun,
} from '../../../src/mods/load/index.ts';
import { installed, modPlugin, organizations, policy, session } from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

spec('mods.overview.Where mods run.claude', () => {
  test('in a terminal, an editor`s integrated terminal or the JetBrains plugin: hooks run and what a mod draws appears', () => {
    expect(whereModsRun({ app: 'terminal' })).toMatchObject({
      hooksRun: true,
      draws: true,
      drawsOn: 'terminal',
    });
  });
});

spec('mods.overview.Where mods run.claude -p', () => {
  test('`claude -p` and the Agent SDK: hooks run, nothing a mod draws appears', () => {
    expect(whereModsRun({ app: 'print' })).toMatchObject({ hooksRun: true, draws: false });
  });

  test('a mod loads in such a session', () => {
    const settings = policy({ where: { app: 'print' } });
    expect(decideModLoad(settings, installed('a')).load).toBe(true);
  });
});

spec('mods.overview.Where mods run.A WSL session in the Desktop app', () => {
  test('no hooks run and nothing is drawn, because plugins are not available there', () => {
    expect(whereModsRun({ app: 'desktop-wsl' })).toMatchObject({ hooksRun: false, draws: false });
  });

  test('the hooks module of an installed plugin does not load there, and the host says so on its line', async () => {
    const settings = policy({ where: { app: 'desktop-wsl' } });
    expect(decideModLoad(settings, installed('a'))).toMatchObject({
      load: false,
      reason: 'plugins are not available in WSL sessions of the Desktop app',
    });
    const register = (on: unknown): void => void on;
    const { host } = session({ a: register }, { policy: settings });
    const report = await host.load([modPlugin(installed('a'), register)]);
    expect(report.loaded).toEqual([]);
    expect(report.lines).toEqual([
      'hooks module a@market not loaded: plugins are not available in WSL sessions of the Desktop app',
    ]);
  });

  test('the organization`s own plugin does not load there either: "plugins aren`t available" holds for every plugin', () => {
    const settings = policy({ where: { app: 'desktop-wsl' } });
    expect(decideModLoad(settings, organizations('acme-guard'))).toMatchObject({
      load: false,
      reason: 'plugins are not available in WSL sessions of the Desktop app',
    });
  });

  test('judgment: a mod built into Claude Code is not a plugin the place refuses: it loads there', () => {
    const settings = policy({ where: { app: 'desktop-wsl' } });
    const builtin = { ...installed('agents-md'), isBuiltin: true, id: 'agents-md@builtin' };
    expect(decideModLoad(settings, builtin).load).toBe(true);
  });

  test('the Code tab of the Desktop app outside WSL is another place: hooks run', () => {
    expect(whereModsRun({ app: 'desktop' }).hooksRun).toBe(true);
    expect(decideModLoad(policy({ where: { app: 'desktop' } }), installed('a')).load).toBe(true);
  });
});

spec('mods.overview.Where mods run.A cloud session', () => {
  test('hooks run for a plugin that reaches the cloud session, and nothing is drawn', () => {
    expect(whereModsRun({ app: 'cloud', reachesCloud: true })).toMatchObject({
      hooksRun: true,
      draws: false,
    });
    expect(whereModsRun({ app: 'cloud', reachesCloud: false }).hooksRun).toBe(false);
  });

  test('a plugin that does not reach the session loads no hooks module there', () => {
    const settings = policy({ where: { app: 'cloud' } });
    const reaching = { ...installed('a'), reachesCloudSession: true };
    expect(decideModLoad(settings, reaching).load).toBe(true);
    expect(decideModLoad(settings, installed('b'))).toMatchObject({
      load: false,
      reason: 'the plugin does not reach the cloud session',
    });
  });
});

spec(`mods.overview.Where mods run.The VS Code extension's chat panel`, () => {
  test('hooks run; the drawing appears with extension version 2.1.299 or later', () => {
    const at = (extensionVersion: string) =>
      whereModsRun({ app: 'vscode', extensionVersion, fetchesFeatureFlags: true });
    expect(at('2.1.299')).toMatchObject({ hooksRun: true, draws: true, drawsOn: 'vscode' });
    expect(at('2.1.298')).toMatchObject({ hooksRun: true, draws: false });
    expect(at('2.2.0').draws).toBe(true);
  });

  test('a session that does not fetch feature flags, such as one on Amazon Bedrock, needs 2.1.304', () => {
    const at = (extensionVersion: string) =>
      whereModsRun({ app: 'vscode', extensionVersion, fetchesFeatureFlags: false });
    expect(at('2.1.303').draws).toBe(false);
    expect(at('2.1.304').draws).toBe(true);
    expect(at('2.1.303').hooksRun).toBe(true);
  });

  test('a session that does not say whether it fetches feature flags is read as one that does: 2.1.299 draws', () => {
    expect(whereModsRun({ app: 'vscode', extensionVersion: '2.1.299' }).draws).toBe(true);
    expect(whereModsRun({ app: 'vscode', extensionVersion: '2.1.298' }).draws).toBe(false);
  });

  test('versions compare by number: 2.1.1000 is later than 2.1.304', () => {
    expect(versionAtLeast('2.1.1000', '2.1.304')).toBe(true);
    expect(versionAtLeast('2.1.99', '2.1.304')).toBe(false);
    expect(versionAtLeast('v2.1.304', '2.1.304')).toBe(true);
  });
});

// The Desktop app and Remote Control rows of the table have no requirement id of their own, so these
// tests are documented behaviour outside `spec(...)` (no id is invented).
test('docs row: Remote Control runs hooks in the session on your machine and draws in the terminal on your machine', () => {
  expect(whereModsRun({ app: 'remote-control' })).toMatchObject({
    hooksRun: true,
    draws: true,
    drawsOn: 'terminal',
  });
});

test('docs row: the Code tab of the Desktop app outside WSL runs hooks and draws, except elements the elements table marks terminal-only', () => {
  expect(whereModsRun({ app: 'desktop' })).toMatchObject({
    hooksRun: true,
    draws: true,
    drawsOn: 'desktop',
    terminalOnlyElementsHidden: true,
  });
});

test('judgment: an unknown extension version draws nothing; no `where` means a place where hooks run', () => {
  expect(whereModsRun({ app: 'vscode' }).draws).toBe(false);
  expect(decideModLoad(policy(), installed('a')).load).toBe(true);
});

spec('mods.overview.Turn mods on or off.Terminal', () => {
  test('mods need Claude Code v2.1.287 or later in the terminal', () => {
    expect(modsVersionProblem('terminal', '2.1.287')).toBeUndefined();
    expect(modsVersionProblem('terminal', '2.1.300')).toBeUndefined();
    expect(modsVersionProblem('terminal', '2.1.286')).toBe(
      'mods need Claude Code v2.1.287 or later; this is v2.1.286',
    );
  });
});

spec('mods.overview.Turn mods on or off.Desktop app', () => {
  test('the Desktop app`s own copy of Claude Code loads mods from v2.1.286', () => {
    expect(modsVersionProblem('desktop', '2.1.286')).toBeUndefined();
    expect(modsVersionProblem('desktop', '2.1.285')).toBe(
      'mods need Claude Code v2.1.286 or later; this is v2.1.285',
    );
  });
});

spec('mods.troubleshoot.Your version is too old', () => {
  test('an older version loads no mods, and what is too old is the number, compared part by part', () => {
    expect(modsVersionProblem('terminal', '2.0.999')).toContain('v2.1.287 or later');
    expect(modsVersionProblem('terminal', '1.9.9')).toContain('v2.1.287 or later');
    expect(modsVersionProblem('terminal', '2.1.1000')).toBeUndefined();
  });

  test('a version the host cannot read is a problem, not a pass', () => {
    expect(modsVersionProblem('terminal', 'latest')).toBe(
      'mods need Claude Code v2.1.287 or later; this is an unreadable version (latest)',
    );
  });
});

spec('mods.troubleshoot.A claude -p run prints hooks module not loaded', () => {
  const print = { isInteractive: false, pluginDir: true, outputFormat: 'text' as const };

  test('a refused hooks module of `claude -p` with --plugin-dir goes to stderr', () => {
    expect(modLineChannel(print, 'not-loaded')).toBe('stderr');
    expect(modLineChannel(print, 'did-not-load')).toBe('stderr');
  });

  test('a refusal by another mod goes to the debug log only', () => {
    expect(modLineChannel(print, 'refused-by-mod')).toBe('debug-log');
  });

  test('a refusal by another mod reaches the transcript of an interactive session that hot-reloads a plugin directory, as the guard table says', () => {
    expect(modLineChannel({ isInteractive: true, pluginDir: true }, 'refused-by-mod')).toBe(
      'transcript',
    );
    expect(
      modLineChannel({ isInteractive: true, pluginDir: false, hotReload: true }, 'refused-by-mod'),
    ).toBe('transcript');
  });

  test('any other interactive session keeps a refusal by another mod in the debug log', () => {
    expect(modLineChannel({ isInteractive: true, pluginDir: false }, 'refused-by-mod')).toBe(
      'debug-log',
    );
    expect(
      modLineChannel({ isInteractive: true, pluginDir: false, hotReload: false }, 'refused-by-mod'),
    ).toBe('debug-log');
  });

  test('the transcript is for an interactive session that hot-reloads a plugin directory; any other interactive session has the debug log only', () => {
    const interactive = { isInteractive: true, pluginDir: true };
    expect(modLineChannel(interactive, 'not-loaded')).toBe('transcript');
    expect(modLineChannel({ isInteractive: true, pluginDir: false }, 'not-loaded')).toBe(
      'debug-log',
    );
    expect(
      modLineChannel({ isInteractive: true, pluginDir: false, hotReload: true }, 'did-not-load'),
    ).toBe('transcript');
  });

  test('judgment: a non-interactive run in another output format keeps the line out of stdout, in the debug log', () => {
    expect(modLineChannel({ ...print, outputFormat: 'json' }, 'not-loaded')).toBe('debug-log');
  });
});
