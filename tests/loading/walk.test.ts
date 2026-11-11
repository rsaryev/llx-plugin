/**
 * What a scan does with links in a folder tree the layout leaves open, as Claude Code 2.1.322 does
 * it (`bun run oracle:runtime`, tests/fixtures/runtime/symlinked-duplicates, and probes recorded in
 * spec/judgments.md): a commands or agents scan does not enter a symlinked folder; a skills scan
 * follows a linked skill folder through the same containment rule as a declared path
 * (plugins/loading.md, "Paths that escape the plugin directory": "A symlink that leads outside the
 * plugin"); a folder or file reached both as itself and through a link loads once, as itself,
 * whichever name sorts first, and of two links with no real entry the first in folder order stays.
 * A port that reports no links still ends at the depth cap.
 *
 * `memoryFiles` does not follow paths below a symlinked folder, so these tests use a `PluginFiles`
 * whose `list`, `stat` and `exists` answer from functions: a folder that lists itself really loops.
 */
import { describe, expect, test } from 'bun:test';
import { discoverComponents } from '../../src/entry/loading.ts';
import type { DirectoryEntry, FileStat, PluginFiles } from '../../src/ports/index.ts';
import { messagesOf, namesOf } from '../support/plugin-folder.ts';

const folder: FileStat = { isFile: false, isDirectory: true, isSymlink: false, size: 0 };
const linkTo = (realPath: string, isDirectory = true): FileStat => ({
  isFile: !isDirectory,
  isDirectory,
  isSymlink: true,
  size: 0,
  realPath,
});

/** A plugin folder: `entriesAt` lists folders, `links` are its symlinks, `existing` its other files. */
function listing(
  entriesAt: (path: string) => readonly DirectoryEntry[] | undefined,
  links: Readonly<Record<string, FileStat>> = {},
  existing: readonly string[] = [],
): PluginFiles & { readonly listed: string[] } {
  const listed: string[] = [];
  const isFolder = (path: string): boolean => entriesAt(path) !== undefined;
  return {
    listed,
    readText: () => Promise.resolve(undefined),
    readBytes: () => Promise.resolve(undefined),
    list: (path) => {
      listed.push(path);
      return Promise.resolve(entriesAt(path));
    },
    stat: (path) => Promise.resolve(links[path] ?? (isFolder(path) ? folder : undefined)),
    exists: (path) => Promise.resolve(existing.includes(path)),
  };
}

const file = (name: string): DirectoryEntry => ({ name, isFile: true, isDirectory: false });
const directory = (name: string): DirectoryEntry => ({ name, isFile: false, isDirectory: true });

describe('the depth cap of a folder scan (judgment)', () => {
  /** The cap in `src/loading/walk.ts`: a folder at this depth is still scanned, the next is not. */
  const MAX_DEPTH = 16;

  test('a port that reports no link for a folder listing itself ends the scan at the cap', async () => {
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

const commandsAt =
  (tree: Readonly<Record<string, readonly DirectoryEntry[]>>) =>
  (path: string): readonly DirectoryEntry[] | undefined =>
    tree[path];

describe('a symlinked folder in a commands or agents scan (oracle 2.1.322; judgment)', () => {
  test('a link back to the folder being scanned is not entered: one listing, one command', async () => {
    const files = listing(
      commandsAt({ commands: [file('a.md'), directory('x'), directory('y')] }),
      { 'commands/x': linkTo('commands'), 'commands/y': linkTo('commands') },
    );
    const found = await discoverComponents(files, undefined, 'my-plugin');
    expect(namesOf(found.commands)).toEqual(['a']);
    expect(files.listed).toEqual(['commands']);
    expect(found.issues).toEqual([]);
  });

  test('a folder link inside the plugin is not followed', async () => {
    const files = listing(
      commandsAt({
        commands: [file('a.md'), directory('shared')],
        'commands/shared': [file('deploy.md')],
      }),
      { 'commands/shared': linkTo('lib/shared') },
    );
    const found = await discoverComponents(files, undefined, 'my-plugin');
    expect(namesOf(found.commands)).toEqual(['a']);
    expect(files.listed).toEqual(['commands']);
    expect(found.issues).toEqual([]);
  });

  test('a folder link that leads outside is not followed, and says nothing', async () => {
    const files = listing(commandsAt({ commands: [file('a.md'), directory('shared')] }), {
      'commands/shared': linkTo('../outside'),
    });
    const found = await discoverComponents(files, undefined, 'my-plugin');
    expect(namesOf(found.commands)).toEqual(['a']);
    expect(found.issues).toEqual([]);
  });

  for (const link of ['alias', 'zlink']) {
    test(`a real folder and a link to it (${link}) load the real one`, async () => {
      const files = listing(
        commandsAt({
          commands: [directory(link), directory('real')].toSorted((a, b) =>
            a.name.localeCompare(b.name),
          ),
          'commands/real': [file('deploy.md')],
          [`commands/${link}`]: [file('deploy.md')],
        }),
        { [`commands/${link}`]: linkTo('commands/real') },
      );
      const found = await discoverComponents(files, undefined, 'my-plugin');
      expect(namesOf(found.commands)).toEqual(['real:deploy']);
    });
  }

  test('an agents folder link is not followed either', async () => {
    const files = listing(
      commandsAt({ agents: [file('x.md'), directory('sub')], 'agents/sub': [file('rev.md')] }),
      { 'agents/sub': linkTo('lib/ag') },
    );
    const found = await discoverComponents(files, undefined, 'my-plugin');
    expect(namesOf(found.agents)).toEqual(['x']);
  });
});

describe('a file reached as itself and through a link (oracle 2.1.322)', () => {
  for (const [real, link] of [
    ['z', 'a'],
    ['a', 'z'],
  ] as const) {
    test(`${link}.md -> ${real}.md loads ${real} only`, async () => {
      const files = listing(commandsAt({ commands: [file('a.md'), file('z.md')] }), {
        [`commands/${link}.md`]: linkTo(`commands/${real}.md`, false),
      });
      const found = await discoverComponents(files, undefined, 'my-plugin');
      expect(namesOf(found.commands)).toEqual([real]);
    });
  }

  test('a file link that leads outside does not load and is a path-escapes error', async () => {
    const files = listing(commandsAt({ commands: [file('a.md'), file('evil.md')] }), {
      'commands/evil.md': linkTo('/etc/evil.md', false),
    });
    const found = await discoverComponents(files, undefined, 'my-plugin');
    expect(namesOf(found.commands)).toEqual(['a']);
    expect(messagesOf(found.issues)).toEqual([
      'commands path escapes plugin directory: commands/evil.md — it resolves to /etc/evil.md, outside the plugin directory',
    ]);
  });
});

describe('a linked skill folder (oracle 2.1.322; judgment where the oracle varies)', () => {
  const skillsOf = (
    children: readonly string[],
    links: Readonly<Record<string, FileStat>>,
    skillFiles: readonly string[],
  ) =>
    listing(
      (path) => (path === 'skills' ? children.toSorted().map(directory) : undefined),
      links,
      skillFiles,
    );

  for (const link of ['alias', 'zlink']) {
    test(`a skill folder and a link to it (${link}) load once, named by the real folder`, async () => {
      const files = skillsOf(['real', link], { [`skills/${link}`]: linkTo('skills/real') }, [
        'skills/real/SKILL.md',
        `skills/${link}/SKILL.md`,
      ]);
      const found = await discoverComponents(files, undefined, 'my-plugin');
      expect(namesOf(found.skills)).toEqual(['real']);
    });
  }

  test('two links to one folder outside skills/ load it once, under the first link in folder order', async () => {
    const files = skillsOf(
      ['a', 'b'],
      { 'skills/a': linkTo('lib/s'), 'skills/b': linkTo('lib/s') },
      ['skills/a/SKILL.md', 'skills/b/SKILL.md'],
    );
    const found = await discoverComponents(files, undefined, 'my-plugin');
    expect(namesOf(found.skills)).toEqual(['a']);
  });

  test('a skill link that leads outside is not loaded and is a path-escapes error', async () => {
    const files = skillsOf(['out'], { 'skills/out': linkTo('../elsewhere') }, [
      'skills/out/SKILL.md',
    ]);
    const found = await discoverComponents(files, undefined, 'my-plugin');
    expect(namesOf(found.skills)).toEqual([]);
    expect(messagesOf(found.issues)).toEqual([
      'skills path escapes plugin directory: skills/out — it resolves to ../elsewhere, outside the plugin directory',
    ]);
  });
});
