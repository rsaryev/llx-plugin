/**
 * The scope folders shared by the skills, the agents and the saved-workflows scans
 * (`src/foundation/scope-folders.ts`): where each kind of base is, and the files of one folder below a
 * base. What the docs leave open (a refused file, a file of another extension) are judgments, tested
 * outside `spec()`.
 */
import { describe, expect, test } from 'bun:test';
import {
  readScopeFiles,
  SCOPE_BASES,
  SCOPE_PLACES,
  watchedFolder,
} from '../../src/foundation/scope-folders.ts';
import { folderScan, type DiskEntry } from '../support/ports.ts';
import { refusing } from '../support/refusing-folders.ts';

const HOME = '/home/user';
const REPO = '/work/repo';
const CWD = '/work/repo/pkg';

async function opened(files: Record<string, DiskEntry>, refused?: string) {
  const port = folderScan(files);
  const folder = await (refused === undefined ? port : refusing(port, refused, 'too large')).open(
    HOME,
  );
  if (folder === undefined) throw new Error('the base does not exist');
  return folder;
}

describe('SCOPE_BASES', () => {
  const context = {
    folders: folderScan({ [`${CWD}/x`]: 'x' }, { repositories: [REPO] }),
    request: { home: HOME, cwd: CWD, addedDirectories: ['/extra'] },
  };

  test('the repository bases run from the working directory up to the repository root, nearest first', async () => {
    expect(await SCOPE_BASES.repository(context)).toEqual([CWD, REPO]);
  });

  test('the added directories are the request’s own', async () => {
    expect(await SCOPE_BASES.added(context)).toEqual(['/extra']);
  });
});

describe('SCOPE_PLACES.user follows CLAUDE_CONFIG_DIR (env-vars.md, claude-directory.md)', () => {
  const roots = ['.claude', '.agents'];
  const folders = folderScan({});
  const placesOf = (configDir?: string) =>
    SCOPE_PLACES.user({ folders, request: { home: HOME, cwd: CWD, configDir } }, roots);

  test('unset, the user scope reads ~/.claude', async () => {
    expect(await placesOf()).toEqual([
      { base: HOME, root: '.claude', index: 0, documented: true },
      { base: HOME, root: '.agents', index: 0, documented: false },
    ]);
  });

  test('set, it reads the configuration directory itself; an extra folder stays below the home', async () => {
    expect(await placesOf('/cfg')).toEqual([
      { base: '/cfg', root: '', index: 0, documented: true },
      { base: HOME, root: '.agents', index: 0, documented: false },
    ]);
  });

  test('set but empty, it is unset (spec/judgments.md)', async () => {
    expect(await placesOf('')).toEqual(await placesOf());
  });
});

describe('readScopeFiles', () => {
  const FILES = {
    [`${HOME}/agents/a.md`]: 'a',
    [`${HOME}/agents/deep/b.MD`]: 'b',
    [`${HOME}/agents/notes.txt`]: 'no',
  };

  test('tree: the files of the extension at any depth, case ignored, with their text', async () => {
    const read = await readScopeFiles(await opened(FILES), 'agents', {
      extension: '.md',
      depth: 'tree',
    });
    expect(read.issues).toEqual([]);
    expect(read.files.map((file) => [file.segments, file.hostPath, file.text])).toEqual([
      [['a.md'], `${HOME}/agents/a.md`, 'a'],
      [['deep', 'b.MD'], `${HOME}/agents/deep/b.MD`, 'b'],
    ]);
  });

  test('flat: the folder alone', async () => {
    const read = await readScopeFiles(await opened(FILES), 'agents', {
      extension: '.md',
      depth: 'flat',
    });
    expect(read.files.map((file) => file.segments)).toEqual([['a.md']]);
  });

  test('a file the port refuses is skipped with a warning; the others still read', async () => {
    const read = await readScopeFiles(await opened(FILES, 'a.md'), 'agents', {
      extension: '.md',
      depth: 'tree',
    });
    expect(read.files.map((file) => file.text)).toEqual(['b']);
    expect(read.issues.map((issue) => [issue.severity, issue.path])).toEqual([
      ['warning', `${HOME}/agents/a.md`],
    ]);
  });
});

describe('watchedFolder', () => {
  test('the host path of a watched folder that exists; nothing otherwise', async () => {
    const folder = await opened({ [`${HOME}/agents/a.md`]: 'a' });
    expect(await watchedFolder(folder, 'agents', { watched: true })).toEqual([`${HOME}/agents`]);
    expect(await watchedFolder(folder, 'agents', { watched: false })).toEqual([]);
    expect(await watchedFolder(folder, 'missing', { watched: true })).toEqual([]);
  });
});
