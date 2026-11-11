/**
 * The walk of a scope folder (spec/judgments.md, `src/foundation/folder-walk.ts`): what the docs leave
 * open about links that dangle or loop and trees that run deep. Judgments, tested outside `spec()`.
 */
import { describe, expect, test } from 'bun:test';
import { listChildren, MAX_DEPTH, walkFiles } from '../../src/foundation/folder-walk.ts';
import { folderScan, type DiskEntry } from '../support/ports.ts';

const BASE = '/home/user';

async function folderOf(files: Record<string, DiskEntry>) {
  const folder = await folderScan(files).open(BASE);
  if (folder === undefined) throw new Error('the base does not exist');
  return folder;
}

describe('listChildren', () => {
  test('a link to a directory elsewhere on disk is a directory, with its real path', async () => {
    const folder = await folderOf({
      '/shared/skill/SKILL.md': 'x',
      [`${BASE}/skills/a`]: { symlink: '/shared/skill' },
      [`${BASE}/skills/b/SKILL.md`]: 'y',
    });
    const { found, issues } = await listChildren(folder, 'skills');
    expect(issues).toEqual([]);
    expect(found.map((child) => [child.name, child.isDirectory, child.canonical])).toEqual([
      ['a', true, '/shared/skill'],
      ['b', true, `${BASE}/skills/b`],
    ]);
  });

  test('a link that leads nowhere is skipped with a warning naming it', async () => {
    const folder = await folderOf({
      [`${BASE}/skills/gone`]: { symlink: '/nowhere' },
      [`${BASE}/skills/ok/SKILL.md`]: 'y',
    });
    const { found, issues } = await listChildren(folder, 'skills');
    expect(found.map((child) => child.name)).toEqual(['ok']);
    expect(issues).toEqual([
      {
        severity: 'warning',
        path: `${BASE}/skills/gone`,
        message: 'a symbolic link that does not lead to a file or folder; skipped',
      },
    ]);
  });

  test('a directory that does not exist lists nothing', async () => {
    const folder = await folderOf({ [`${BASE}/other/x.md`]: 'x' });
    expect(await listChildren(folder, 'skills')).toEqual({ found: [], issues: [] });
  });
});

describe('walkFiles', () => {
  test('the Markdown files at any depth, the folders joined as segments', async () => {
    const folder = await folderOf({
      [`${BASE}/commands/a.md`]: 'a',
      [`${BASE}/commands/frontend/b.MD`]: 'b',
      [`${BASE}/commands/frontend/notes.txt`]: 'no',
    });
    const { found } = await walkFiles(folder, 'commands', { extension: '.md' });
    expect(found.map((file) => file.segments.join('/'))).toEqual(['a.md', 'frontend/b.MD']);
  });

  test('a link loop ends: each real directory is walked once', async () => {
    const folder = await folderOf({
      [`${BASE}/commands/a.md`]: 'a',
      [`${BASE}/commands/loop`]: { symlink: `${BASE}/commands` },
      [`${BASE}/commands/deep/b.md`]: 'b',
      [`${BASE}/commands/deep/back`]: { symlink: `${BASE}/commands/deep` },
    });
    const { found } = await walkFiles(folder, 'commands', { extension: '.md' });
    expect(found.map((file) => file.segments.join('/'))).toEqual(['a.md', 'deep/b.md']);
  });

  test('a tree deeper than the limit is not walked further', async () => {
    const path = Array.from({ length: MAX_DEPTH + 2 }, (_unused, index) => `d${index}`).join('/');
    const folder = await folderOf({
      [`${BASE}/commands/top.md`]: 'top',
      [`${BASE}/commands/${path}/deep.md`]: 'deep',
    });
    const { found } = await walkFiles(folder, 'commands', { extension: '.md' });
    expect(found.map((file) => file.segments.at(-1))).toEqual(['top.md']);
  });
});
