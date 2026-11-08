/**
 * What a scan does with a folder tree the layout leaves open (judgments in spec/judgments.md,
 * `src/loading/walk.ts`): a loop of folders ends at the depth cap, and a symlinked folder found
 * while scanning is followed. plugins/loading.md § Paths that escape the plugin directory restricts
 * "a component path" declared in `plugin.json` or a marketplace entry; it says nothing about the
 * folders a scan finds under a declared or default location.
 *
 * `memoryFiles` does not follow paths below a symlinked folder, so these tests use a `PluginFiles`
 * whose `list` answers from a function: a folder that lists itself really loops.
 */
import { describe, expect, test } from 'bun:test';
import { discoverComponents } from '../../src/index.ts';
import type { DirectoryEntry, PluginFiles } from '../../src/ports/index.ts';
import { namesOf } from '../support/plugin-folder.ts';

const folder = { isFile: false, isDirectory: true, isSymlink: false, size: 0 } as const;

/** A plugin folder whose only folder, `commands`, lists whatever `entriesAt` says for the path. */
function listing(
  entriesAt: (path: string) => readonly DirectoryEntry[] | undefined,
): PluginFiles & {
  readonly listed: string[];
} {
  const listed: string[] = [];
  return {
    listed,
    readText: () => Promise.resolve(undefined),
    readBytes: () => Promise.resolve(undefined),
    list: (path) => {
      listed.push(path);
      return Promise.resolve(entriesAt(path));
    },
    stat: (path) => Promise.resolve(path === 'commands' ? folder : undefined),
    exists: () => Promise.resolve(false),
  };
}

const file = (name: string): DirectoryEntry => ({ name, isFile: true, isDirectory: false });
const directory = (name: string): DirectoryEntry => ({ name, isFile: false, isDirectory: true });

describe('the depth cap of a folder scan (judgment)', () => {
  /** The cap in `src/loading/walk.ts`: a folder at this depth is still scanned, the next is not. */
  const MAX_DEPTH = 16;

  test('a folder that lists itself ends the scan at the cap, with every level named once', async () => {
    const files = listing((path) =>
      path.startsWith('commands') ? [file('a.md'), directory('loop')] : undefined,
    );
    const found = await discoverComponents(files, undefined, 'my-plugin');
    const names = Array.from({ length: MAX_DEPTH + 1 }, (_, depth) =>
      [...Array.from({ length: depth }, () => 'loop'), 'a'].join(':'),
    );
    expect(namesOf(found.commands)).toEqual(names);
    expect(files.listed).toHaveLength(MAX_DEPTH + 1);
    expect(files.listed.at(-1)).toBe(['commands', ...Array(MAX_DEPTH).fill('loop')].join('/'));
    expect(found.issues).toEqual([]);
  });
});

describe('a symlinked folder found while scanning (judgment)', () => {
  test('is followed like any folder: its files load, with the folder in the name and no issue', async () => {
    // `commands/shared` links to `/outside`; the port lists it, so the scan reads what the port gives.
    const files = listing((path) => {
      if (path === 'commands') return [file('a.md'), directory('shared')];
      return path === 'commands/shared' ? [file('deploy.md')] : undefined;
    });
    const found = await discoverComponents(files, undefined, 'my-plugin');
    expect(namesOf(found.commands)).toEqual(['a', 'shared:deploy']);
    expect(found.issues).toEqual([]);
  });
});
