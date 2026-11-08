/**
 * plugins/mods/create.md § Check what Claude Code reads from your mod: `claude plugin validate` on a
 * mod's directory prints what Claude Code reads from the module (`hooks:`, `calls:`, `env reads:`,
 * `env writes:`, `state reads:`, `state writes:` and one `gating hook ... .catch` line for each hook
 * that can refuse), reports a misspelled event, and the six rules that let the static analysis find
 * every hook and call. The module is read from the compiler's scan output; the engine runs the other.
 */
import { expect, test } from 'bun:test';
import { validateMod } from '../../../src/mods/load/commands/validate.ts';
import { memoryFiles } from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';

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

const wrap = (body: string): string =>
  `export function register(on) { on('tool.call', async ($, e, next) => { ${body}; return next(e) }) }`;

/** What `validate` prints for a module, and whether it passed. */
async function check(module: string, extra: Record<string, string> = {}) {
  const report = await validateMod({ files: folder(module, extra), target: './first-mod' });
  return { lines: report.lines, ok: report.exitCode === 0 };
}

/** The error lines `validate` printed. */
const errorsOf = (lines: readonly string[]): string[] =>
  lines.filter((line) => line.startsWith('  ✘'));

spec('mods.create.Check what Claude Code reads from your mod', () => {
  test('first-mod prints the hooks line with each filter in braces, the calls line, and passes: exactly the lines the docs show', async () => {
    const { lines, ok } = await check(FIRST_MOD);
    // "the output includes these lines"; tool.call can refuse a call, so its gating line follows (same page)
    expect(lines.filter((line) => line.startsWith('  ❯'))).toEqual([
      '  ❯ ./register.js hooks: session.start, tool.call, command.run{command=tally}, ui.render{component=Spinner}',
      '  ❯ ./register.js calls: $.command.register, $.ui.invalidate',
      '  ❯ ./register.js gating hook without .catch: tool.call',
    ]);
    expect(lines.at(-1)).toBe('✔ Validation passed');
    expect(ok).toBe(true);
  });

  test('a module that reads or sets environment variables or uses $.state gets env and state lines too', async () => {
    const module = `
import { atom, read, update } from 'claude-code'
const count = atom({ plugin: 'hello-tabs', key: 'count' }, 0)
export function register(on) {
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    await read($, count)
    await update($, count, (n) => n + 1)
    $.env.get('HOME'); $.env.set('CI', '1')
    return next(e)
  })
}`;
    const types = `declare module 'claude-code' { interface PluginState { 'hello-tabs': { count: number } } }`;
    const { lines } = await check(module, { 'types/index.d.ts': types });
    expect(lines).toContain('  ❯ ./register.js env reads: HOME');
    expect(lines).toContain('  ❯ ./register.js env writes: CI');
    expect(lines).toContain('  ❯ ./register.js state reads: hello-tabs.count');
    expect(lines).toContain('  ❯ ./register.js state writes: hello-tabs.count');
  });

  test('one line for each hook that can refuse, saying whether it has a .catch handler', async () => {
    const module = `
async function guard($, e, next) { return next(e) }
export function register(on) {
  on('tool.call', { tool: 'Bash' }, guard).catch(async ($, e, next) => next(e))
  on('prompt.submit', async ($, e, next) => next(e))
}`;
    const { lines } = await check(module);
    expect(lines).toContain('  ❯ ./register.js gating hook with .catch: tool.call');
    expect(lines).toContain('  ❯ ./register.js gating hook without .catch: prompt.submit');
  });

  test('a misspelled event is an error, and the event is missing from the hooks line, so Claude Code would not call it either', async () => {
    const { lines, ok } = await check(
      "export function register(on) { on('tool.calls', async ($, e, next) => next(e)) }",
    );
    expect(ok).toBe(false);
    expect(lines.join('\n')).toContain('"tool.calls" is not an event');
    expect(lines.some((line) => line.includes('hooks: tool.calls'))).toBe(false);
  });

  test('rule: write each mods API call in full; pass `$` to a top-level function of the same file, which reads `(via loadNotes)`', async () => {
    const via = `
async function loadNotes($) { return $.store.get('notes') }
export function register(on) { on('session.start', async ($, e, next) => { await loadNotes($); return next(e) }) }`;
    const passed = await check(via);
    expect(passed.lines).toContain('  ❯ ./register.js calls: $.store.get (via loadNotes)');
    expect(passed.ok).toBe(true);
  });

  test('rule: `$` passed to a method, a function defined inside the hook, or an imported function fails validation, with that one error and no other', async () => {
    const failing = [
      wrap('({ f($) {} }).f($)'),
      wrap('const f = ($) => $.fs.read("x"); f($)'),
      `import { helper } from './helper.js'\n${wrap('helper($)')}`,
    ];
    for (const module of failing) {
      const { lines, ok } = await check(module);
      expect(ok).toBe(false);
      expect(errorsOf(lines)).toHaveLength(1);
    }
  });

  test('rule: `const ui = $.ui` fails with the documented `$.ui is used as a value`', async () => {
    const { lines, ok } = await check(wrap('const ui = $.ui'));
    expect(ok).toBe(false);
    expect(errorsOf(lines)).toEqual(['  ✘ ./register.js: ./register.js: $.ui is used as a value']);
  });

  test('rule: destructuring `$` and indexing it with a computed name fail validation, each with that one error', async () => {
    for (const module of [wrap('const { ui } = $'), wrap("const n = 'ui'; $[n].log('x')")]) {
      const { lines, ok } = await check(module);
      expect(ok).toBe(false);
      expect(errorsOf(lines)).toHaveLength(1);
    }
  });

  test('rule: the event name in each `on` call is a string literal; a variable or a loop over names fails', async () => {
    const message = 'the event name passed to on() is not a string literal';
    for (const module of [
      "export function register(on) { const name = 'tool.call'; on(name, async ($, e, next) => next(e)) }",
      "export function register(on) { for (const name of ['tool.call']) { on(name, async ($, e, next) => next(e)) } }",
    ]) {
      const { lines, ok } = await check(module);
      expect(ok).toBe(false);
      expect(lines.join('\n')).toContain(message);
    }
  });

  test('rule: inside `register`, a second variable or parameter named `on` fails with `"on" is declared again (shadowed)`', async () => {
    for (const module of [
      'export function register(on) { { const on = 1 } }',
      'export function register(on) { function go(on) {} }',
    ]) {
      const { lines, ok } = await check(module);
      expect(ok).toBe(false);
      expect(lines.join('\n')).toContain('"on" is declared again (shadowed)');
    }
  });

  test('rule: import only files inside the plugin directory by relative path; the one bare import allowed is claude-code', async () => {
    const head = (line: string): string => `${line}\nexport function register(on) {}`;
    expect((await check(head("import { atom } from 'claude-code'"))).ok).toBe(true);
    expect((await check(head("import { f } from './f.js'"))).ok).toBe(true);
    for (const [line, specifier] of [
      ["import x from 'left-pad'", 'left-pad'],
      ["import x from '../../outside.js'", '../../outside.js'],
    ] as const) {
      const { lines, ok } = await check(head(line));
      expect(ok).toBe(false);
      const errors = errorsOf(lines);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(`imports "${specifier}"`);
    }
  });

  test('rule: use import declarations at the top of the file; a dynamic import() fails with the documented reason', async () => {
    const { lines, ok } = await check(wrap("await import('./x.js')"));
    expect(ok).toBe(false);
    expect(lines.join('\n')).toContain(
      'a dynamic import(); a hooks module imports its own files with an import declaration',
    );
  });

  test('rule: write every file as an ES module, with import and not require', async () => {
    const { lines, ok } = await check(`const fs = require('fs')\nexport function register(on) {}`);
    expect(ok).toBe(false);
    expect(lines.join('\n')).toContain('require()');
  });
});
