/**
 * plugins/mods/reference.md § Files (the file table and the paragraph under it), plugins/mods/create.md
 * § Write a mod yourself (steps 2 to 4), plugins/mods/troubleshoot.md § `validate` passes and lists no
 * `hooks` line, plugins/manifest-reference.md (`types`).
 */
import { expect, test } from 'bun:test';
import {
  isHooksModuleName,
  isModTestFile,
  readHooksFile,
  readHooksJsonModules,
  readManifest,
  resolveTypesPath,
} from '../../src/format/index.ts';
import { spec } from '../support/spec.ts';

const FIRST_MOD_MANIFEST = {
  name: 'first-mod',
  version: '0.1.0',
  description:
    "Counts Claude's tool calls, shows the count beside the spinner, and adds a /tally command",
  author: { name: 'Your Name' },
};

spec('mods.file..claude-plugin/plugin.json', () => {
  test('the first-mod manifest of the tutorial is a plain manifest: mods add no required field', () => {
    const read = readManifest(FIRST_MOD_MANIFEST);
    expect(read.issues).toEqual([]);
    expect(read.manifest?.name).toBe('first-mod');
  });

  test('a manifest without `hooks/hooks.json` fields still loads: nothing about a mod is in it', () => {
    const read = readManifest({ name: 'plain' });
    expect(read.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
  });
});

spec('mods.file.hooks/hooks.json', () => {
  test('`modules` is an array with one path relative to the file: ./register.js is hooks/register.js', () => {
    const read = readHooksJsonModules({
      description: 'The first-mod hooks module',
      modules: ['./register.js'],
    });
    expect(read).toEqual({ entry: 'hooks/register.js', written: './register.js', issues: [] });
  });

  test('a path with a sub folder is joined to hooks/ and `..` that stays inside the plugin is resolved', () => {
    expect(readHooksJsonModules({ modules: ['./mod/register.ts'] }).entry).toBe(
      'hooks/mod/register.ts',
    );
    expect(readHooksJsonModules({ modules: ['../src/register.ts'] }).entry).toBe('src/register.ts');
  });

  test('a path that leaves the plugin folder is an error', () => {
    const read = readHooksJsonModules({ modules: ['../../outside.js'] });
    expect(read.entry).toBeUndefined();
    expect(read.issues).toHaveLength(1);
    expect(read.issues[0]?.severity).toBe('error');
  });

  test('exactly one path: none or two is an error, and `modules` that is not an array is one', () => {
    for (const modules of [[], ['./a.js', './b.js'], './a.js', [3]]) {
      const read = readHooksJsonModules({ modules });
      expect(read.entry).toBeUndefined();
      expect(read.issues.map((issue) => issue.severity)).toEqual(['error']);
    }
  });

  test('no `modules` key means no mod, and no issue: the plugin is a plugin without a hooks module', () => {
    expect(readHooksJsonModules({ hooks: {} })).toEqual({ issues: [] });
    // a misspelled key is no key: validate lists no hooks line (troubleshoot.md)
    expect(readHooksJsonModules({ module: ['./register.js'] }).entry).toBeUndefined();
  });

  test('the same file can hold settings hooks under `hooks`, which the hooks reader still reads', () => {
    const file = {
      modules: ['./register.js'],
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo' }] }] },
    };
    expect(readHooksJsonModules(file).entry).toBe('hooks/register.js');
    expect(readHooksFile(file).hooks.PreToolUse).toHaveLength(1);
  });
});

spec('mods.file.hooks/register.js', () => {
  test('the module is named .js .mjs .cjs .jsx .ts .mts .cts or .tsx', () => {
    for (const name of ['a.js', 'a.mjs', 'a.cjs', 'a.jsx', 'a.ts', 'a.mts', 'a.cts', 'a.tsx']) {
      expect(isHooksModuleName(name)).toBe(true);
    }
    for (const name of ['a.json', 'a.py', 'a.d.ts.map', 'register']) {
      expect(isHooksModuleName(name)).toBe(false);
    }
  });

  test('hooks.json naming a file of another kind is an error', () => {
    const read = readHooksJsonModules({ modules: ['./register.py'] });
    expect(read.entry).toBeUndefined();
    expect(read.issues[0]?.severity).toBe('error');
  });
});

spec('mods.file..test.ts', () => {
  test('files whose names end in .test.ts or .test.tsx are tests, others are not', () => {
    expect(isModTestFile('tests/first-mod.test.ts')).toBe(true);
    expect(isModTestFile('ui.test.tsx')).toBe(true);
    for (const name of ['first-mod.ts', 'a.test.js', 'a.test.ts.bak', 'test.ts']) {
      expect(isModTestFile(name)).toBe(false);
    }
  });
});

spec('mods.file.types/index.d.ts', () => {
  test('the declaration file is types/index.d.ts unless `types` in the manifest names another path', () => {
    expect(resolveTypesPath({})).toBe('types/index.d.ts');
    expect(resolveTypesPath({ types: './declarations/mod.d.ts' })).toBe('declarations/mod.d.ts');
  });

  test('the manifest of hello-tabs points at its declaration with `types` and still reads', () => {
    const read = readManifest({
      name: 'hello-tabs',
      version: '0.1.0',
      types: './types/index.d.ts',
    });
    expect(read.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(resolveTypesPath(read.manifest ?? {})).toBe('types/index.d.ts');
  });
});
