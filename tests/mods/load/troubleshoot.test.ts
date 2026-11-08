/**
 * plugins/mods/troubleshoot.md, the entries a hooks module meets when it loads: `validate` passes
 * and lists no `hooks` line, `hooks module did not load`, `options do not fit plugin.json
 * userConfig`, `code nested too deep to scan`, `the engine ran out of stack linking the file and its
 * imports`, `the parser stopped` or `the engine ran out of stack loading the file`, `the module
 * failed without a message` and `hook skipped` have their own files. Each line starts with the mod's name; the kit
 * writes it as a value, and a host's runtime reports what only an engine can see.
 */
import { expect, test } from 'bun:test';
import { validateMod } from '../../../src/mods/load/commands/validate.ts';
import { engineStackIssue } from '../../../src/mods/load/engine-faults.ts';
import type { ModPlugin } from '../../../src/mods/load/index.ts';
import type { ModRuntime } from '../../../src/mods/ports.ts';
import {
  inline,
  installed,
  modPlugin,
  policy,
  registerOf,
  session,
} from '../../support/mods-load.ts';
import { memoryFiles } from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';

const noop = registerOf(() => undefined);

/** A mod whose hooks module is the text `source`, with the manifest it needs. */
function written(
  candidate: ModPlugin['candidate'],
  source: string,
  manifest: object = {},
): ModPlugin {
  return {
    candidate,
    files: memoryFiles({
      '.claude-plugin/plugin.json': JSON.stringify({ name: candidate.name, ...manifest }),
      'hooks/hooks.json': JSON.stringify({ modules: ['./register.js'] }),
      'hooks/register.js': source,
    }),
  };
}

const nestedScopes = (levels: number): string =>
  `export function register(on) {}\nfunction f() ${'{'.repeat(levels)}${'}'.repeat(levels)}`;

const loadText = async (source: string, options: Parameters<typeof session>[1] = {}) => {
  const { host } = session({ 'first-mod': noop }, options);
  return host.load([written(inline('first-mod'), source)]);
};

const runtimeReporting = (...issues: ReturnType<typeof engineStackIssue>[]): ModRuntime => ({
  load: () => Promise.resolve({ issues }),
});

spec('mods.troubleshoot.code nested too deep to scan: more than 2000 scopes', () => {
  test('a file with 2,001 scopes nested does not load: the line is the mod, the load failure, the file and the reason', async () => {
    const report = await loadText(nestedScopes(2001));
    expect(report.loaded).toEqual([]);
    expect(report.lines).toEqual([
      'first-mod: hooks module did not load: hooks/register.js: code nested too deep to scan: more than 2000 scopes',
    ]);
  });

  test('2,000 scopes still load', async () => {
    const report = await loadText(nestedScopes(2000));
    expect(report.lines).toEqual([]);
    expect(report.loaded.map((mod) => mod.name)).toEqual(['first-mod']);
  });

  test('`claude plugin validate` reports the same reason', async () => {
    const files = written(inline('first-mod'), nestedScopes(2001)).files;
    const report = await validateMod({ files, target: '.' });
    expect(report.exitCode).toBe(1);
    expect(report.lines.join('\n')).toContain(
      'register.js: code nested too deep to scan: more than 2000 scopes',
    );
  });
});

spec('mods.troubleshoot.the engine ran out of stack linking the file and its imports', () => {
  test('the line names the mod and the file the engine could not link, then the reason, and the mod does not load', async () => {
    const { host } = session(
      { 'first-mod': noop },
      { runtime: runtimeReporting(engineStackIssue('link', 'hooks/deep.js', '')) },
    );
    const report = await host.load([modPlugin(inline('first-mod'), noop)]);
    expect(report.loaded).toEqual([]);
    expect(report.lines).toEqual([
      'first-mod: hooks module did not load: hooks/deep.js: the engine ran out of stack linking the file and its imports',
    ]);
    expect(host.active()).toEqual([]);
  });

  test('the reason is the same whatever the engine says: it names no message and no line', () => {
    expect(engineStackIssue('link', 'a.js', 'Maximum call stack size exceeded.').message).toBe(
      engineStackIssue('link', 'a.js', 'RangeError at 1:2').message,
    );
  });
});

spec('mods.troubleshoot.the parser stopped or the engine ran out of stack loading the file', () => {
  const deepArrays = `export function register(on) {}\nconst x = ${'['.repeat(100_000)}${']'.repeat(100_000)}`;

  test('code the parser cannot read for stack is `code nested too deep to scan (the parser stopped: <message>)`, with no line number', async () => {
    const report = await loadText(deepArrays);
    expect(report.loaded).toEqual([]);
    expect(report.lines).toHaveLength(1);
    expect(report.lines[0]).toMatch(
      /^first-mod: hooks module did not load: hooks\/register\.js: code nested too deep to scan \(the parser stopped: [^()]+\)$/,
    );
    // "The reason gives no line number"
    expect(report.lines[0]).not.toMatch(/\d+:\d+/);
  });

  test('`claude plugin validate` stops at the same reason', async () => {
    const files = written(inline('first-mod'), deepArrays).files;
    const report = await validateMod({ files, target: '.' });
    expect(report.exitCode).toBe(1);
    expect(report.lines.join('\n')).toContain(
      'register.js: code nested too deep to scan (the parser stopped: ',
    );
  });

  test('an engine that ran out of stack loading the file gives `the engine ran out of stack loading the file (code nested too deep): <message>`', async () => {
    const throwing: ModRuntime = {
      load: () => Promise.reject(new RangeError('Maximum call stack size exceeded. (3:41)')),
    };
    const { host } = session({ 'first-mod': noop }, { runtime: throwing });
    const report = await host.load([modPlugin(inline('first-mod'), noop)]);
    expect(report.loaded).toEqual([]);
    expect(report.lines).toEqual([
      'first-mod: hooks module did not load: hooks/register.js: the engine ran out of stack loading the file (code nested too deep): Maximum call stack size exceeded.',
    ]);
  });
});

spec('mods.troubleshoot.validate passes and lists no hooks line', () => {
  const manifest = JSON.stringify({ name: 'first-mod', version: '0.1.0' });
  const folder = (hooksJson: object) =>
    memoryFiles({
      '.claude-plugin/plugin.json': manifest,
      'hooks/hooks.json': JSON.stringify(hooksJson),
      'hooks/register.js':
        "export function register(on) { on('session.start', async ($, e, next) => next(e)) }",
    });

  test('a hooks.json with no `modules` key, or the key misspelled, passes and prints no hooks line', async () => {
    for (const hooksJson of [{}, { module: ['./register.js'] }, { Modules: ['./register.js'] }]) {
      const report = await validateMod({ files: folder(hooksJson), target: '.' });
      expect(report.exitCode).toBe(0);
      expect(report.lines.at(-1)).toStartWith('✔ Validation passed');
      expect(report.lines.some((line) => line.includes(' hooks: '))).toBe(false);
    }
  });

  test('adding `"modules": ["./register.js"]` makes the hooks line appear', async () => {
    const report = await validateMod({
      files: folder({ modules: ['./register.js'] }),
      target: '.',
    });
    expect(report.lines).toContain('  ❯ ./register.js hooks: session.start');
  });

  test('a session loads nothing from it: no module, and no line saying why', async () => {
    const { host } = session({ 'first-mod': noop });
    const plugin: ModPlugin = { candidate: inline('first-mod'), files: folder({ module: [] }) };
    const report = await host.load([plugin]);
    expect(report.loaded).toEqual([]);
    expect(report.lines).toEqual([]);
  });
});

spec('mods.troubleshoot.hooks module did not load', () => {
  test('a module the parser rejects gives the line `<mod>: hooks module did not load: <file>:<line>…` with the position of the problem in the code', async () => {
    const report = await loadText('export function register(on) {\n  on(\n}');
    expect(report.loaded).toEqual([]);
    expect(report.lines).toHaveLength(1);
    expect(report.lines[0]).toMatch(
      /^first-mod: hooks module did not load: hooks\/register\.js: .+ \(\d+:\d+\)$/,
    );
  });

  test('a module whose top-level code threw is a line with the reason the engine gave, and no throw out of load', async () => {
    const runtime: ModRuntime = {
      load: () =>
        Promise.resolve({
          issues: [
            {
              severity: 'error',
              path: 'hooks/register.js',
              message: 'hooks/register.js:2: ReferenceError: tally is not defined',
            },
          ],
        }),
    };
    const { host } = session({ 'first-mod': noop }, { runtime });
    const report = await host.load([modPlugin(inline('first-mod'), noop)]);
    expect(report.lines).toEqual([
      'first-mod: hooks module did not load: hooks/register.js:2: ReferenceError: tally is not defined',
    ]);
  });

  test('a reload that fails ends the line with `; the version loaded before is unloaded`, no version runs, and a reload after the fix loads it again', async () => {
    let source = 'export function register(on) {}';
    const files = {
      ...modPlugin(inline('first-mod'), noop).files,
      readText: (path: string) =>
        path === 'hooks/register.js'
          ? Promise.resolve(source)
          : modPlugin(inline('first-mod'), noop).files.readText(path),
    };
    const { host } = session({ 'first-mod': noop });
    await host.load([{ candidate: inline('first-mod'), files }]);
    expect(host.active().map((mod) => mod.name)).toEqual(['first-mod']);
    source = 'export function register(on) { ';
    const failed = await host.reload();
    expect(failed.lines).toHaveLength(1);
    expect(failed.lines[0]).toMatch(
      /^first-mod: hooks module did not load: .*; the version loaded before is unloaded$/,
    );
    expect(host.active()).toEqual([]);
    source = 'export function register(on) {}';
    const fixed = await host.reload();
    expect(fixed.lines).toEqual([]);
    expect(host.active().map((mod) => mod.name)).toEqual(['first-mod']);
  });

  test('a first load that fails has no version before it, so the line does not say one is unloaded', async () => {
    const report = await loadText('export function register(on) { ');
    expect(report.lines[0]).not.toContain('the version loaded before is unloaded');
  });
});

spec('mods.troubleshoot.options do not fit plugin.json userConfig', () => {
  const USER_CONFIG = {
    count: { type: 'number', title: 'Count', description: 'How many', default: 1, max: 10 },
    token: { type: 'string', title: 'Token', description: 'A token', required: true },
  };
  const loadWith = async (options: Record<string, string | number>) => {
    const { host } = session(
      { 'first-mod': noop },
      {
        policy: policy({
          user: { pluginConfigs: { 'first-mod@market': { options } } },
        }),
      },
    );
    const plugin = written(installed('first-mod'), 'export function register(on) {}', {
      userConfig: USER_CONFIG,
    });
    return host.load([plugin]);
  };

  test('a number above the field max fails the load; the line ends with the pluginConfigs entry in settings.json', async () => {
    const report = await loadWith({ count: 11, token: 't' });
    expect(report.loaded).toEqual([]);
    expect(report.lines).toEqual([
      'first-mod: hooks module did not load: options do not fit plugin.json userConfig: count 11 is above the maximum 10 (pluginConfigs["first-mod@market"].options in settings.json)',
    ]);
  });

  test('a required field with no value fails the same way', async () => {
    const report = await loadWith({ count: 3 });
    expect(report.lines).toEqual([
      'first-mod: hooks module did not load: options do not fit plugin.json userConfig: token is required and has no value (pluginConfigs["first-mod@market"].options in settings.json)',
    ]);
  });

  test('setting or changing the value is the fix: the mod loads', async () => {
    const report = await loadWith({ count: 10, token: 't' });
    expect(report.lines).toEqual([]);
    expect(report.loaded.map((mod) => mod.name)).toEqual(['first-mod']);
  });
});
