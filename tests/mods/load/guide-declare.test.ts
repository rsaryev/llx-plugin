/**
 * plugins/mods/interface.md § Keep a value in `$.state`: "Declare the values" (the type declaration
 * file, the outer key is your plugin's name, each entry under it is a value and its type), "Point the
 * manifest at the declaration" (the `types` field "to let `claude plugin validate` check your code
 * against that file"), and the validation messages of "Define, read, and write a value".
 */
import { describe, expect, test } from 'bun:test';
import { validateMod } from '../../../src/mods/load/commands/validate.ts';
import { memoryFiles } from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';

// hello-tabs/types/index.d.ts of the docs.
const TYPES = `declare module 'claude-code' {
  interface PluginState {
    'hello-tabs': {
      tab: 'one' | 'two'
      count: number
    }
  }
}`;

// hello-tabs/.claude-plugin/plugin.json of the docs.
const manifest = (extra: Record<string, unknown> = { types: './types/index.d.ts' }) =>
  JSON.stringify({
    name: 'hello-tabs',
    version: '0.1.0',
    description: 'Opens a pane with two tabs and a counter',
    author: { name: 'Your Name' },
    ...extra,
  });

const MODULE = `
import { atom, read, update } from 'claude-code'
const count = atom({ plugin: 'hello-tabs', key: 'count' }, 0)
const tab = atom({ plugin: 'hello-tabs', key: 'tab' }, 'one')
export function register(on) {
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    const n = await read($, count)
    const which = await read($, tab)
    return next(e)
  })
  on('session.start', async ($, e, next) => {
    await update($, count, (value) => value + 1)
    return next(e)
  })
}`;

const folder = (files: Record<string, string>, source = MODULE) =>
  memoryFiles({
    '.claude-plugin/plugin.json': manifest(),
    'hooks/hooks.json': JSON.stringify({ modules: ['./register.js'] }),
    'hooks/register.js': source,
    ...files,
  });

const check = async (files: Record<string, string>, source = MODULE) => {
  const result = await validateMod({ files: folder(files, source), target: '.' });
  return { exitCode: result.exitCode, text: result.lines.join('\n') };
};

// "each entry under it is a value and its type": validate checks that a value is declared, not what
// its type is, so that half of the sentence is not proven here (judgments below, spec/judgments.md).
spec('mods.interface.Declare the values', () => {
  test('the declaration of the docs declares both values under the plugin name: the code is checked against it and passes', async () => {
    const result = await check({ 'types/index.d.ts': TYPES });
    expect(result.exitCode).toBe(0);
    expect(result.text).toContain('state reads: hello-tabs.count, hello-tabs.tab');
    expect(result.text).toContain('state writes: hello-tabs.count');
    expect(result.text).not.toContain('is not declared');
  });

  test('a value the file does not list fails with `hello-tabs.count is not declared`', async () => {
    const result = await check({
      'types/index.d.ts': `declare module 'claude-code' { interface PluginState { 'hello-tabs': { tab: 'one' | 'two' } } }`,
    });
    expect(result.exitCode).toBe(1);
    expect(result.text).toContain('hello-tabs.count is not declared');
    expect(result.text).not.toContain('hello-tabs.tab is not declared');
  });

  test('the outer key is the plugin name: the same values under another key declare nothing for this plugin', async () => {
    const result = await check({
      'types/index.d.ts': TYPES.replace("'hello-tabs'", "'other-mod'"),
    });
    expect(result.exitCode).toBe(1);
    expect(result.text).toContain('hello-tabs.count is not declared');
    expect(result.text).toContain('hello-tabs.tab is not declared');
  });
});

spec('mods.interface.Point the manifest at the declaration', () => {
  const unlisted = `declare module 'claude-code' { interface PluginState { 'hello-tabs': { tab: 'one' | 'two' } } }`;

  test('`types` names the path: a declaration at another path is read, and the file at the usual path is not', async () => {
    const files = memoryFiles({
      '.claude-plugin/plugin.json': manifest({ types: './decl/state.d.ts' }),
      'hooks/hooks.json': JSON.stringify({ modules: ['./register.js'] }),
      'hooks/register.js': MODULE,
      'decl/state.d.ts': TYPES,
      'types/index.d.ts': `declare module 'claude-code' { interface PluginState { 'hello-tabs': { other: number } } }`,
    });
    const result = await validateMod({ files, target: '.' });
    expect(result.exitCode).toBe(0);
    expect(result.lines.join('\n')).not.toContain('is not declared');
  });

  test('`types` left out of the manifest: the file at types/index.d.ts is the declaration the code is checked against', async () => {
    const files = (declaration: string) =>
      memoryFiles({
        '.claude-plugin/plugin.json': manifest({}),
        'hooks/hooks.json': JSON.stringify({ modules: ['./register.js'] }),
        'hooks/register.js': MODULE,
        'types/index.d.ts': declaration,
      });
    const complete = await validateMod({ files: files(TYPES), target: '.' });
    expect(complete.exitCode).toBe(0);
    const partial = await validateMod({ files: files(unlisted), target: '.' });
    expect(partial.exitCode).toBe(1);
    expect(partial.lines.join('\n')).toContain('hello-tabs.count is not declared');
  });

  test('a module that uses $.state with no declaration at the path fails, whether `types` is left out or names a file that is not there', async () => {
    const without = (extra: Record<string, unknown>) =>
      memoryFiles({
        '.claude-plugin/plugin.json': manifest(extra),
        'hooks/hooks.json': JSON.stringify({ modules: ['./register.js'] }),
        'hooks/register.js': MODULE,
        // The usual path is filled when `types` names another one, so it is the field that decides.
        ...(extra.types === undefined ? {} : { 'types/index.d.ts': TYPES }),
      });
    const absent = await validateMod({ files: without({}), target: '.' });
    expect(absent.exitCode).toBe(1);
    expect(absent.lines.join('\n')).toContain(
      'the module uses $.state, so types/index.d.ts must declare its values',
    );
    const missing = await validateMod({ files: without({ types: './missing.d.ts' }), target: '.' });
    expect(missing.exitCode).toBe(1);
    expect(missing.lines.join('\n')).toContain(
      'the module uses $.state, so missing.d.ts must declare its values',
    );
  });
});

const withAtom = (declaration: string) => `
import { atom, read } from 'claude-code'
${declaration}
export function register(on) {
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    await read($, count)
    return next(e)
  })
}`;

spec('mods.interface.Define, read, and write a value', () => {
  test('the atom of the docs, a const with plugin and key as string literals and a default, validates when declared', async () => {
    const result = await check(
      { 'types/index.d.ts': TYPES },
      withAtom(`const count = atom({ plugin: 'hello-tabs', key: 'count' }, 0)`),
    );
    expect(result.exitCode).toBe(0);
    expect(result.text).toContain('state reads: hello-tabs.count');
  });

  test('plugin and key are string literals: the scan reads them from the source, and a name held in a variable fails', async () => {
    const result = await check(
      { 'types/index.d.ts': TYPES },
      withAtom(`const name = 'hello-tabs'\nconst count = atom({ plugin: name, key: 'count' }, 0)`),
    );
    expect(result.exitCode).toBe(1);
    expect(result.text).toContain('takes a source the scan can read');
  });

  test('the atom is held in a const: declared with let, validation fails with `takes a source the scan can read`', async () => {
    const result = await check(
      { 'types/index.d.ts': TYPES },
      withAtom(`let count = atom({ plugin: 'hello-tabs', key: 'count' }, 0)`),
    );
    expect(result.exitCode).toBe(1);
    expect(result.text).toContain('takes a source the scan can read');
  });

  test('every value is declared in the type declaration file: otherwise validation fails with `hello-tabs.count is not declared`', async () => {
    const result = await check(
      {
        'types/index.d.ts': `declare module 'claude-code' { interface PluginState { 'hello-tabs': { tab: string } } }`,
      },
      withAtom(`const count = atom({ plugin: 'hello-tabs', key: 'count' }, 0)`),
    );
    expect(result.exitCode).toBe(1);
    expect(result.text).toContain('hello-tabs.count is not declared');
  });

  test('a write comes from a callback or from another event hook, and validate lists it as a state write', async () => {
    const result = await check({ 'types/index.d.ts': TYPES });
    // `session.start` of MODULE writes `count`; the `ui.render` hook only reads.
    expect(result.text).toContain('state writes: hello-tabs.count');
    expect(result.text).toContain('state reads: hello-tabs.count, hello-tabs.tab');
  });
});

// Judgments (spec/judgments.md): none of these is under `spec(...)`, since a judgment is never compatibility.
describe('what validate leaves unchecked in a declaration', () => {
  test('the type of a declared value is not checked: a default of "x" for a number passes, because the kit has no TypeScript parser', async () => {
    const result = await check(
      { 'types/index.d.ts': TYPES },
      withAtom(`const count = atom({ plugin: 'hello-tabs', key: 'count' }, 'x')`),
    );
    expect(result.exitCode).toBe(0);
    expect(result.text).not.toContain('is not declared');
  });

  test('a $.state write inside a ui.render hook is not refused: validate lists it as a state write, and at runtime it does not redraw its own site (tests/mods/ui/redraw.test.ts)', async () => {
    const writing = `
import { atom, read, update } from 'claude-code'
const count = atom({ plugin: 'hello-tabs', key: 'count' }, 0)
export function register(on) {
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    const n = await read($, count)
    await update($, count, (value) => value + 1)
    return next(e)
  })
}`;
    const result = await check({ 'types/index.d.ts': TYPES }, writing);
    expect(result.exitCode).toBe(0);
    expect(result.text).toContain('state reads: hello-tabs.count');
    expect(result.text).toContain('state writes: hello-tabs.count');
  });
});
