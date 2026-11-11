/**
 * `./mods/isolate` (docs/API.md, "Entry points") runs where neither Node nor Bun is: every module
 * it reaches, import by import, names no `node:` or `bun` module, and the only package it imports
 * is `zod`. The walk reads each file's static `import` and `export … from` specifiers.
 */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import pkg from '../../package.json';

const ROOT = resolve(import.meta.dir, '../..');
const SPECIFIER =
  /(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;
const PACKAGES = new Set(['zod']);

/** Every file the entry reaches, and every package specifier any of them names. */
function walk(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const pending = [entry];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (files.has(file)) continue;
    files.add(file);
    for (const match of readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
      const specifier = match[1] ?? match[2] ?? '';
      if (specifier.startsWith('.')) pending.push(join(dirname(file), specifier));
      else packages.add(specifier);
    }
  }
  return { files, packages };
}

test('./mods/isolate reaches no node: or bun module, and no package but zod', () => {
  const source = pkg.exports['./mods/isolate'].bun;
  expect(source).toBe('./src/entry/mod-isolate.ts');
  const { files, packages } = walk(join(ROOT, source));
  expect(files.size).toBeGreaterThan(3);
  expect([...packages].filter((name) => !PACKAGES.has(name))).toEqual([]);
});

test('the isolate entry offers the state helpers, their source text and the element checks', async () => {
  const isolate = await import('../../src/entry/mod-isolate.ts');
  for (const name of ['atom', 'read', 'update', 'derive', 'memberOf', 'STATE_LIBRARY_SOURCE']) {
    expect(name in isolate).toBe(true);
  }
});

test('the isolate entry offers the element constructors, the JSX factory, the pattern and matcher tests, and the data checks; ./mods has each too', async () => {
  const isolate = await import('../../src/entry/mod-isolate.ts');
  const mods = await import('../../src/entry/mods.ts');
  const names = [
    'elementFn',
    'elementNameOf',
    'h',
    'Fragment',
    'selects',
    'matchesEvent',
    'isHookBody',
    'deepFreeze',
    'frozenCopy',
    'plainDataProblem',
  ];
  expect(names.filter((name) => !(name in isolate))).toEqual([]);
  expect(names.filter((name) => !(name in mods))).toEqual([]);
});

test('the isolate entry offers every name of ./mods/elements, the UI surface list among them, as the same values', async () => {
  const isolate: Record<string, unknown> = await import('../../src/entry/mod-isolate.ts');
  const elements: Record<string, unknown> = await import('../../src/entry/mod-elements.ts');
  const mods: Record<string, unknown> = await import('../../src/entry/mods.ts');
  expect(Object.keys(elements).filter((name) => isolate[name] !== elements[name])).toEqual([]);
  expect(isolate.UI_SURFACES).toEqual(['terminal', 'desktop', 'vscode', 'mobile']);
  expect(isolate.UI_SURFACES).toBe(mods.UI_SURFACES);
  expect(elements.UI_SURFACES).toBe(mods.UI_SURFACES);
});
