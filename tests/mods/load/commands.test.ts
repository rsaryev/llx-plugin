/**
 * plugins/mods/reference.md § Commands (the table), plugins/mods/create.md § Check what Claude Code
 * reads from your mod, § Write a mod yourself (the `claude --plugin-dir` step), plugins/mods/overview.md
 * § See which mods a session loaded, plugins/mods/troubleshoot.md § `validate` passes and lists no
 * `hooks` line, plugins/cli-reference.md § plugin validate (exit codes and the `--json` report),
 * plugins/mods/admin.md § Review what a mod can do.
 */
import { expect, test } from 'bun:test';
import { activeModsLine } from '../../../src/mods/load/index.ts';
import { validateMod } from '../../../src/mods/load/commands/validate.ts';
import { memoryFiles } from '../../support/ports.ts';
import { inline, modPlugin, session } from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

const FIRST_MOD = `
let calls = 0
export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'tally', description: 'Show how many tool calls Claude has made' })
    return next(e)
  })
  on('tool.call', async ($, e, next) => {
    calls += 1
    $.ui.invalidate('ui.render')
    return next(e)
  })
  on('command.run', { command: 'tally' }, async () => {
    return { text: 'Claude has made ' + calls + ' tool calls since this mod loaded' }
  })
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    return next({ ...e, props: { ...e.props, suffix: ' · tool calls: ' + calls + '…' } })
  })
}
`;

const MANIFEST = JSON.stringify({
  name: 'first-mod',
  version: '0.1.0',
  description: 'Counts tool calls',
  author: { name: 'Your Name' },
});

const folder = (module: string, extra: Record<string, string> = {}) =>
  memoryFiles({
    '.claude-plugin/plugin.json': MANIFEST,
    'hooks/hooks.json': JSON.stringify({ modules: ['./register.js'] }),
    'hooks/register.js': module,
    ...extra,
  });

spec('mods.command.claude plugin validate <directory>', () => {
  test('prints the hooks and calls lines of the tutorial mod and passes', async () => {
    const report = await validateMod({ files: folder(FIRST_MOD), target: './first-mod' });
    expect(report.lines).toContain(
      '  ❯ ./register.js hooks: session.start, tool.call, command.run{command=tally}, ui.render{component=Spinner}',
    );
    expect(report.lines).toContain('  ❯ ./register.js calls: $.command.register, $.ui.invalidate');
    expect(report.lines.at(-1)).toBe('✔ Validation passed');
    expect(report.exitCode).toBe(0);
  });

  test('a misspelled event is an error naming it, the hooks line leaves it out, and the exit code is 1', async () => {
    const module = FIRST_MOD.replace("on('tool.call'", "on('tool.calls'");
    const report = await validateMod({ files: folder(module), target: './first-mod' });
    expect(report.lines.join('\n')).toContain('"tool.calls" is not an event');
    expect(report.lines.join('\n')).not.toContain('hooks: session.start, tool.calls');
    expect(report.lines.at(-1)).toBe('✘ Validation failed');
    expect(report.exitCode).toBe(1);
  });

  test('env reads and writes, state reads and writes and each gating hook get their own lines', async () => {
    const module = `
export function register(on) {
  on('tool.call', async ($, e, next) => { $.env.get('HOME'); $.env.set('CI', '1'); return next(e) }).catch(async ($, e, next) => next(e))
  on('prompt.submit', async ($, e, next) => next(e))
}`;
    const report = await validateMod({ files: folder(module), target: '.' });
    expect(report.lines).toContain('  ❯ ./register.js env reads: HOME');
    expect(report.lines).toContain('  ❯ ./register.js env writes: CI');
    expect(report.lines).toContain('  ❯ ./register.js gating hook with .catch: tool.call');
    expect(report.lines).toContain('  ❯ ./register.js gating hook without .catch: prompt.submit');
  });

  test('--json: the report has success, strict, target, manifest, contents with the gating hooks, and advice', async () => {
    const module = `export function register(on) { on('prompt.submit', async ($, e, next) => next(e)) }`;
    const report = await validateMod(
      { files: folder(module), target: './first-mod' },
      { strict: true },
    );
    expect(
      Object.keys(report)
        .filter((key) => key !== 'lines' && key !== 'exitCode')
        .toSorted(),
    ).toEqual(['advice', 'contents', 'manifest', 'strict', 'success', 'target']);
    expect(report).toMatchObject({
      success: true,
      strict: true,
      target: './first-mod',
      advice: [],
    });
    expect(report.contents).toEqual([
      {
        file: './register.js',
        errors: [],
        warnings: [],
        notes: [
          './register.js hooks: prompt.submit',
          './register.js gating hook without .catch: prompt.submit',
        ],
        gatingHooks: [
          { module: './register.js', pattern: null, hook: 'prompt.submit', hasCatch: false },
        ],
      },
    ]);
  });

  test('--strict treats a warning as an error: the verdict line and the exit code say so', async () => {
    const files = memoryFiles({
      '.claude-plugin/plugin.json': JSON.stringify({ name: 'first-mod' }),
      'hooks/hooks.json': JSON.stringify({ modules: ['./register.js'] }),
      'hooks/register.js': 'export function register(on) {}',
    });
    const loose = await validateMod({ files, target: '.' });
    expect(loose.lines.at(-1)).toBe('✔ Validation passed with warnings');
    expect(loose.exitCode).toBe(0);
    const strict = await validateMod({ files, target: '.' }, { strict: true });
    expect(strict.lines.at(-1)).toBe('✘ Validation failed (--strict treats warnings as errors)');
    expect(strict.exitCode).toBe(1);
  });

  test('hooks.json without `modules`, or with the key misspelled, passes and lists no hooks line', async () => {
    for (const hooksJson of [{ description: 'no modules' }, { module: ['./register.js'] }]) {
      const files = memoryFiles({
        '.claude-plugin/plugin.json': MANIFEST,
        'hooks/hooks.json': JSON.stringify(hooksJson),
      });
      const report = await validateMod({ files, target: '.' });
      expect(report.exitCode).toBe(0);
      expect(report.lines.join('\n')).not.toContain('hooks:');
    }
  });

  test('a module with deeply nested scopes fails with the documented reason; so does a bad import and a missing manifest', async () => {
    const deep = `export function register(on) {}\nfunction f() ${'{'.repeat(2001)}${'}'.repeat(2001)}`;
    const nested = await validateMod({ files: folder(deep), target: '.' });
    expect(nested.lines.join('\n')).toContain(
      'code nested too deep to scan: more than 2000 scopes',
    );
    const imports = await validateMod({
      files: folder("import x from 'left-pad'\nexport function register(on) {}"),
      target: '.',
    });
    expect(imports.exitCode).toBe(1);
    const none = await validateMod({ files: memoryFiles({}), target: '.' });
    expect(none.exitCode).toBe(1);
  });

  test('a module that uses $.state needs its declaration file, and every value declared in it (interface.md)', async () => {
    const module = `
import { atom, read } from 'claude-code'
const count = atom({ plugin: 'hello-tabs', key: 'count' }, 0)
export function register(on) { on('ui.render', { component: 'Pane' }, async ($, e, next) => { await read($, count); return next(e) }) }`;
    const without = await validateMod({ files: folder(module), target: '.' });
    expect(without.exitCode).toBe(1);
    expect(without.lines.join('\n')).toContain('types/index.d.ts');
    const declared = `declare module 'claude-code' { interface PluginState { 'hello-tabs': { count: number } } }`;
    const files = folder(module, { 'types/index.d.ts': declared });
    expect((await validateMod({ files, target: '.' })).lines).toContain(
      '  ❯ ./register.js state reads: hello-tabs.count',
    );
    const missing = folder(module, {
      'types/index.d.ts': `declare module 'claude-code' { interface PluginState { 'hello-tabs': { tab: string } } }`,
    });
    expect((await validateMod({ files: missing, target: '.' })).lines.join('\n')).toContain(
      'hello-tabs.count is not declared',
    );
    // a manifest `types` names another path
    const elsewhere = memoryFiles({
      '.claude-plugin/plugin.json': JSON.stringify({
        ...JSON.parse(MANIFEST),
        types: './decl/mod.d.ts',
      }),
      'hooks/hooks.json': JSON.stringify({ modules: ['./register.js'] }),
      'hooks/register.js': module,
      'decl/mod.d.ts': declared,
    });
    expect((await validateMod({ files: elsewhere, target: '.' })).exitCode).toBe(0);
  });

  test('a TypeScript module is read through the compiler; without one it is an error', async () => {
    const files = memoryFiles({
      '.claude-plugin/plugin.json': MANIFEST,
      'hooks/hooks.json': JSON.stringify({ modules: ['./register.ts'] }),
      'hooks/register.ts': 'export function register(on: unknown): void {}',
    });
    expect((await validateMod({ files, target: '.' })).exitCode).toBe(1);
    const compiler = {
      compile: () =>
        Promise.resolve({
          code: "export function register(on) { on('session.start', async ($, e, next) => next(e)) }",
          issues: [],
        }),
    };
    const report = await validateMod({ files, target: '.', compiler });
    expect(report.lines).toContain('  ❯ ./register.ts hooks: session.start');
  });
});

spec('mods.command./plugin', () => {
  test('shows `1 mod active · first-mod` when a mod that is not built in has loaded', () => {
    expect(activeModsLine([{ name: 'first-mod', isBuiltin: false }])).toBe(
      '1 mod active · first-mod',
    );
  });

  test('nothing is shown when only built-in mods loaded, or none', () => {
    expect(activeModsLine([])).toBeUndefined();
    expect(activeModsLine([{ name: 'cc-plugin-sec-default', isBuiltin: true }])).toBeUndefined();
  });

  test('built-in mods are not counted or named', () => {
    expect(
      activeModsLine([
        { name: 'cc-plugin-sec-default', isBuiltin: true },
        { name: 'a', isBuiltin: false },
      ]),
    ).toBe('1 mod active · a');
  });

  test('the host gives the loaded mods the line is made from', async () => {
    const register = (on: unknown): void => void on;
    const { host } = session({ 'first-mod': register });
    await host.load([modPlugin(inline('first-mod'), register)]);
    expect(activeModsLine(host.active())).toBe('1 mod active · first-mod');
  });
});

test('judgment: several mods are `N mods active · a, b`', () => {
  expect(
    activeModsLine([
      { name: 'cc-plugin-sec-default', isBuiltin: true },
      { name: 'a', isBuiltin: false },
      { name: 'b', isBuiltin: false },
    ]),
  ).toBe('2 mods active · a, b');
});
