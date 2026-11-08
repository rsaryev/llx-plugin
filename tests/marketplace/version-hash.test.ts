/**
 * plugins/loading.md § How Claude Code computes the version (a `command` source: "a 12-character
 * hash", "For what the hash covers, see Copy mode and link mode"; `git-subdir`: "a hash of the
 * subdirectory path"); plugins/marketplace-reference.md § Copy mode and link mode (copy: a hash of
 * the copied files, "a re-run that produces identical files counts as up to date"; link: "the
 * version comes from the printed directory's real path and its top-level entries, not from the
 * files inside them", "file contents aren't hashed").
 *
 * The hash inputs are decided here and hashed through the `Sha256` port; the real hash is used so
 * a test sees a digest depend on its input.
 */
import { describe, expect, test } from 'bun:test';
import {
  copyModeHash,
  linkModeHash,
  subdirectoryPathHash,
} from '../../src/marketplace/version-hash.ts';
import type { PluginFiles } from '../../src/ports/files.ts';
import { memoryFiles } from '../support/ports.ts';
import { fakeSha256, realSha256 } from '../support/marketplace-ports.ts';
import { spec } from '../support/spec.ts';

const PLUGIN = {
  '.claude-plugin/plugin.json': '{"name":"formatter"}',
  'skills/format/SKILL.md': '# format',
  'hooks/hooks.json': '{}',
};

/** `files` whose directory listings come back in reverse order, to show the hash does not trust it. */
const reversed = (files: PluginFiles): PluginFiles => ({
  readText: (path, signal) => files.readText(path, signal),
  readBytes: (path, signal) => files.readBytes(path, signal),
  stat: (path, signal) => files.stat(path, signal),
  exists: (path, signal) => files.exists(path, signal),
  list: async (path, signal) => (await files.list(path, signal))?.toReversed(),
});

const copyHash = (tree: Record<string, string | Uint8Array | { symlink: string }>) =>
  copyModeHash(memoryFiles(tree), realSha256);

spec('updates.loading.How Claude Code computes the version', () => {
  describe('copy mode: a hash of the copied files', () => {
    test('is 12 lower-case hex characters', async () => {
      expect(await copyHash(PLUGIN)).toMatch(/^[0-9a-f]{12}$/u);
    });

    test('identical files give the same hash, so a re-run counts as up to date', async () => {
      expect(await copyHash({ ...PLUGIN })).toBe(await copyHash(PLUGIN));
    });

    test('does not depend on the order the folder lists its entries in', async () => {
      const files = memoryFiles(PLUGIN);
      expect(await copyModeHash(reversed(files), realSha256)).toBe(
        await copyModeHash(files, realSha256),
      );
    });

    test('a changed byte in any file is a new version', async () => {
      const before = await copyHash(PLUGIN);
      expect(await copyHash({ ...PLUGIN, 'hooks/hooks.json': '{ }' })).not.toBe(before);
      expect(await copyHash({ ...PLUGIN, 'skills/format/SKILL.md': '# formaT' })).not.toBe(before);
    });

    test('an added or removed file is a new version', async () => {
      const before = await copyHash(PLUGIN);
      expect(await copyHash({ ...PLUGIN, 'README.md': 'hi' })).not.toBe(before);
      const { 'hooks/hooks.json': _removed, ...fewer } = PLUGIN;
      expect(await copyHash(fewer)).not.toBe(before);
    });

    test('the same content under another path is a new version', async () => {
      const before = await copyHash({ 'a.md': 'one', 'b.md': 'two' });
      expect(await copyHash({ 'a.md': 'two', 'b.md': 'one' })).not.toBe(before);
      expect(await copyHash({ 'x/a.md': 'one', 'b.md': 'two' })).not.toBe(before);
    });

    test('the bytes of every file go through the port, and nothing else is read', async () => {
      const sha256 = fakeSha256('a'.repeat(64));
      const files = memoryFiles({ 'a.md': 'one', 'dir/b.md': 'two' });
      expect(await copyModeHash(files, sha256)).toBe('aaaaaaaaaaaa');
      const texts = sha256.hashed.map((bytes) => new TextDecoder().decode(bytes));
      expect(texts).toContain('one');
      expect(texts).toContain('two');
    });
  });

  describe('link mode: the real path and the top-level entries, never the files inside', () => {
    const top = { 'skills/a/SKILL.md': 'one', 'package.json': '{}' };
    const linkHash = (realPath: string, tree: Record<string, string> = top) =>
      linkModeHash(realPath, memoryFiles(tree), realSha256);

    test('is 12 lower-case hex characters', async () => {
      expect(await linkHash('/work/export')).toMatch(/^[0-9a-f]{12}$/u);
    });

    test('printing a different path signals new content', async () => {
      expect(await linkHash('/work/export-2')).not.toBe(await linkHash('/work/export'));
    });

    test('a new, removed or renamed top-level entry is a new version', async () => {
      const before = await linkHash('/work/export');
      expect(await linkHash('/work/export', { ...top, 'bin/run': '#!' })).not.toBe(before);
      expect(await linkHash('/work/export', { 'skills/a/SKILL.md': 'one' })).not.toBe(before);
      expect(
        await linkHash('/work/export', { 'skills/a/SKILL.md': 'one', 'package-lock.json': '{}' }),
      ).not.toBe(before);
    });

    test('a change inside a top-level entry is not seen: "file contents aren\'t hashed"', async () => {
      const before = await linkHash('/work/export');
      const edited = {
        'skills/a/SKILL.md': 'edited',
        'skills/a/new.md': 'x',
        'package.json': '{ }',
      };
      expect(await linkHash('/work/export', edited)).toBe(before);
    });

    test('reads only the top level: no file is opened', async () => {
      const files = memoryFiles(top);
      await linkModeHash('/work/export', files, realSha256);
      expect(files.reads).toEqual([]);
      expect(files.accesses.every((access) => access.operation === 'list')).toBe(true);
    });

    test('does not depend on the listing order', async () => {
      const files = memoryFiles(top);
      expect(await linkModeHash('/p', reversed(files), realSha256)).toBe(
        await linkModeHash('/p', files, realSha256),
      );
    });
  });
});

spec('updates.loading.How Claude Code computes the version.github', () => {
  test('the hash of a git-subdir path is the same for the same path and differs for another', async () => {
    const hash = (path: string) => subdirectoryPathHash(path, realSha256);
    expect(await hash('plugins/formatter')).toBe(await hash('plugins/formatter'));
    expect(await hash('plugins/formatter')).not.toBe(await hash('plugins/linter'));
    expect(await hash('plugins/formatter')).toMatch(/^[0-9a-f]{8}$/u);
  });

  test('a leading ./ and a trailing slash name the same directory', async () => {
    const hash = (path: string) => subdirectoryPathHash(path, realSha256);
    expect(await hash('./plugins/formatter/')).toBe(await hash('plugins/formatter'));
  });
});
