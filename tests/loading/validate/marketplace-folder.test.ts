/**
 * `validatePlugin` over a marketplace folder (oracle 2.1.319): the file's own findings, the
 * `plugins[i] plugin.json → …` findings of an entry whose folder is inside the marketplace, and how
 * schema errors are told from the validator's checks by the way their path is written.
 */
import { describe, expect, test } from 'bun:test';
import { validatePlugin } from '../../../src/index.ts';
import { memoryFiles } from '../../support/ports.ts';

type Tree = Parameters<typeof memoryFiles>[0];

const MARKET = '.claude-plugin/marketplace.json';
const market = (plugins: unknown[], extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ name: 'shop', owner: { name: 'O' }, description: 'Shop', plugins, ...extra });
const where = async (tree: Tree) =>
  (await validatePlugin({ files: memoryFiles(tree) })).issues.map((issue) => [
    issue.severity,
    issue.path,
    issue.message,
  ]);

describe('top level', () => {
  test('a missing description and an empty list are warnings, but only when the schema passes', async () => {
    const sound = await where({
      [MARKET]: JSON.stringify({ name: 's', owner: { name: 'O' }, plugins: [] }),
    });
    expect(sound.map(([severity, path]) => [severity, path])).toEqual([
      ['warning', 'plugins'],
      ['warning', 'description'],
    ]);
    const broken = await where({ [MARKET]: JSON.stringify({ name: 's', plugins: [] }) });
    expect(broken).toEqual([
      ['error', 'owner', 'Invalid input: expected object, received undefined'],
    ]);
  });

  test('the entries are read beside a broken top level', async () => {
    const found = await where({
      [MARKET]: JSON.stringify({ plugins: [{ name: 'a b', source: './a' }] }),
    });
    expect(found.map(([, path]) => path)).toEqual([
      'name',
      'owner',
      'plugins.0.name',
      'plugins[0].name',
      'plugins[0].name',
    ]);
  });
});

describe('entries', () => {
  test('a schema error is written with dots and a check of the validator with brackets', async () => {
    const found = await where({ [MARKET]: market([{ name: 'a b', source: './a' }]) });
    expect(found.map(([severity, path]) => [severity, path])).toEqual([
      ['error', 'plugins.0.name'],
      ['error', 'plugins[0].name'],
      ['warning', 'plugins[0].name'],
    ]);
    expect(found[0]?.[2]).toBe(
      'Plugin name cannot contain spaces. Use kebab-case (e.g., "my-plugin")',
    );
  });

  test('a source that matches no type is "Invalid input" at the dotted source', async () => {
    const found = await where({ [MARKET]: market([{ name: 'a', source: { type: 'git' } }]) });
    expect(found).toEqual([['error', 'plugins.0.source', 'Invalid input']]);
  });

  test('a reserved plugin name is an error, but not in an official marketplace', async () => {
    const entry = { name: 'claude-x', source: './x' };
    const third = await where({ [MARKET]: market([entry]) });
    expect(third[0]?.slice(0, 2)).toEqual(['error', 'plugins[0].name']);
    const official = await where({
      [MARKET]: market([entry], { name: 'claude-plugins-official' }),
    });
    expect(official).toEqual([]);
  });

  test('an entry that lives elsewhere is not read from the folder', async () => {
    const found = await where({
      [MARKET]: market([
        { name: 'a', source: { source: 'git-subdir', url: 'https://x.y/z.git', path: 'a' } },
      ]),
      'a/.claude-plugin/plugin.json': '{}',
    });
    expect(found).toEqual([]);
  });
});

describe('the manifest of an entry in the marketplace', () => {
  const entryTree = (plugin: string, entry: Record<string, unknown> = {}): Tree => ({
    [MARKET]: market([{ name: 'a', source: './a', ...entry }]),
    'a/.claude-plugin/plugin.json': plugin,
  });

  test('its findings carry the entry as a prefix', async () => {
    const found = await where(entryTree('{"name":"a","version":"1.0.0"}'));
    expect(found.map(([severity, path]) => [severity, path])).toEqual([
      ['warning', 'plugins[0] plugin.json → description'],
      ['warning', 'plugins[0] plugin.json → author'],
    ]);
  });

  test('a version the entry declares and the manifest contradicts is a warning, unless the entry is broken', async () => {
    const plugin = '{"name":"a","version":"2.0.0","description":"d","author":{"name":"x"}}';
    const found = await where(entryTree(plugin, { version: '1.0.0' }));
    expect(found).toHaveLength(1);
    expect(found[0]?.[1]).toBe('plugins[0].version');
    expect(found[0]?.[2]).toStartWith(
      'Entry declares version "1.0.0" but a/.claude-plugin/plugin.json says "2.0.0".',
    );
    const broken = await where(entryTree(plugin, { version: '1.0.0', skills: 5 }));
    expect(broken.map(([, path]) => path)).not.toContain('plugins[0].version');
  });

  test('a manifest that does not parse is a warning on the source and an error on the file', async () => {
    const found = await where(entryTree('{ "name"'));
    expect(found.map(([severity, path]) => [severity, path])).toEqual([
      ['warning', 'plugins[0].source'],
      ['error', 'plugins[0] plugin.json → json'],
    ]);
  });

  test('a source that is a file cannot hold a manifest', async () => {
    const found = await where({ [MARKET]: market([{ name: 'a', source: './a' }]), a: 'file' });
    expect(found[0]?.[2]).toStartWith(
      'A path component of a/.claude-plugin/plugin.json is not a directory',
    );
  });
});

describe('links (the validator never follows one)', () => {
  test('a manifest that is a link is a warning on the entry source', async () => {
    const found = await where({
      [MARKET]: market([{ name: 'a', source: './a' }]),
      'a/.claude-plugin/plugin.json': { symlink: 'a/real.json' },
      'a/real.json': '{}',
    });
    expect(found).toEqual([
      [
        'warning',
        'plugins[0].source',
        '.claude-plugin/plugin.json is a symlink or is not a regular file, so it was not validated. Install reads it anyway. Validate it separately.',
      ],
    ]);
  });

  test('a folder on the way that is a link names the source', async () => {
    const found = await where({
      [MARKET]: market([{ name: 'a', source: './a' }]),
      'a/.claude-plugin': { symlink: 'real' },
      'real/plugin.json': '{}',
    });
    expect(found[0]?.[2]).toStartWith(
      'Local source "./a" is or traverses a symlink, so .claude-plugin/plugin.json was not read',
    );
  });
});
