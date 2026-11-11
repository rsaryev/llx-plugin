/**
 * plugins/host-marketplace.md § Stay within the download limits for hosted files ("After an archive
 * downloads, the install fails when the zip exceeds any of these extraction limits": Entries, File
 * size, Total size, Compression ratio) judged from the entry list `ArchiveReader.scan` returns, with
 * nothing unzipped; plugins/marketplace-reference.md § archive plugin source ("The plugin root may
 * be at the top of the zip or one directory down"). The paths and links an archive may hold are
 * judgments (spec/judgments.md): the docs name no zip-slip rule for archives.
 */
import { describe, expect, test } from 'bun:test';
import { archiveStats, unsafeEntryIssue } from '../../src/marketplace/archive-scan.ts';
import type { ArchiveEntry } from '../../src/ports/marketplace.ts';
import {
  fetchWith,
  MIB,
  oneFile,
  ratioOf,
  refusal,
  stats,
  totalOf,
  zipFor,
  zipOf,
} from '../support/marketplace-archive.ts';
import { spec } from '../support/spec.ts';

const LIMITS = 'marketplace.hosting.Stay within the download limits for hosted files';
const file = (path: string, size = 1): ArchiveEntry => ({ path, size, isSymlink: false });
const link = (path: string, linkTarget?: string): ArchiveEntry => ({
  path,
  size: 0,
  isSymlink: true,
  ...(linkTarget === undefined ? {} : { linkTarget }),
});

spec(`${LIMITS}.Entries`, () => {
  test('100,000 files and directories install, one more fails', async () => {
    const at = fetchWith([zipOf(1000)], { scan: stats({ entries: 100_000 }) });
    expect(await at.result).toMatchObject({ root: '', stats: { entries: 100_000 } });
    const past = await refusal(fetchWith([zipOf(1000)], { scan: stats({ entries: 100_001 }) }));
    expect(past.message).toBe('The archive has more than 100000 files and directories');
  });

  test('the count is the number of entries the scan lists, directories included', () => {
    const scan = { entries: [file('p/'), file('p/a'), file('p/b')] };
    expect(archiveStats(scan, 10).entries).toBe(3);
  });
});

spec(`${LIMITS}.File size`, () => {
  test('512 MiB for any one file installs, one byte more fails', async () => {
    const at = oneFile(512 * MIB);
    expect(await fetchWith([zipFor(at)], { scan: at }).result).toMatchObject({ root: '' });
    const past = oneFile(512 * MIB + 1);
    const issue = await refusal(fetchWith([zipFor(past)], { scan: past }));
    expect(issue.message).toBe('A file in the archive is larger than 512 MiB uncompressed');
  });

  test('the largest file is the largest entry of the scan', () => {
    const scan = { entries: [file('p/a', 5), file('p/b', 9), file('p/c', 2)] };
    expect(archiveStats(scan, 10).largestFileBytes).toBe(9);
  });
});

spec(`${LIMITS}.Total size`, () => {
  test('1 GiB uncompressed in total installs, one byte more fails', async () => {
    const at = totalOf(1024 * MIB);
    expect(await fetchWith([zipFor(at)], { scan: at }).result).toMatchObject({ root: '' });
    const past = totalOf(1024 * MIB + 1);
    const issue = await refusal(fetchWith([zipFor(past)], { scan: past }));
    expect(issue.message).toBe('The archive is larger than 1024 MiB uncompressed');
  });

  test('the total is the sum of the entries, never a number the host reports', () => {
    const scan = { entries: [file('p/a', 5), file('p/b', 9), file('p/c', 2)] };
    expect(archiveStats(scan, 10).uncompressedBytes).toBe(16);
  });
});

spec(`${LIMITS}.Compression ratio`, () => {
  test('content 50 times the size of the zip installs, more than that fails', async () => {
    expect(await fetchWith([zipOf(1000)], { scan: ratioOf(50_000) }).result).toMatchObject({
      root: '',
    });
    const issue = await refusal(fetchWith([zipOf(1000)], { scan: ratioOf(50_001) }));
    expect(issue.message).toBe("The archive's content is more than 50 times the size of the zip");
  });

  test('the ratio is against the length of the zip the kit downloaded', () => {
    expect(archiveStats({ entries: [file('p/a', 100)] }, 1000).compressedBytes).toBe(1000);
  });
});

describe('what a scan gives the kit (judgments)', () => {
  test('the top level is the first name of every entry, once, in archive order', () => {
    const scan = { entries: [file('a/'), file('a/x'), file('b'), file('a/y'), file('c/z')] };
    expect(archiveStats(scan, 1).topLevel).toEqual(['a', 'b', 'c']);
  });

  test('an entry that would be written outside the plugin directory is refused whole', () => {
    for (const path of ['../evil', 'p/../../evil', '/etc/passwd', 'C:/x', 'p\\..\\evil']) {
      const issue = unsafeEntryIssue({ entries: [file('p/ok'), file(path)] }, 'p');
      expect(issue?.message).toBe(
        `The archive entry "${path}" would be extracted outside the plugin directory`,
      );
    }
  });

  test('a link whose target stays inside the plugin directory is fine', () => {
    const scan = { entries: [file('p/a/real'), link('p/b/l', '../a/real'), link('p/m', 'a')] };
    expect(unsafeEntryIssue(scan, 'p')).toBeUndefined();
    expect(unsafeEntryIssue({ entries: [link('x/l', '../y')] }, '')).toBeUndefined();
  });

  test('a link that leaves the plugin directory, or points at an absolute path, is refused', () => {
    for (const target of ['../../outside', '/etc/passwd', '../..', 'C:/x']) {
      const issue = unsafeEntryIssue({ entries: [link('p/a/l', target)] }, 'p');
      expect(issue?.message).toBe(
        `The archive entry "p/a/l" is a symbolic link to "${target}", which leaves the plugin directory`,
      );
    }
  });

  test('a link above the top of a zip with its root at the top is refused too', () => {
    const issue = unsafeEntryIssue({ entries: [link('l', '../x')] }, '');
    expect(issue?.message).toContain('leaves the plugin directory');
  });

  test('a link is resolved through the links it passes, so a chain of inside links cannot climb out', () => {
    const scan = {
      entries: [file('skills/'), link('a/b/d', '../..'), link('a/b/l', 'd/../escaped')],
    };
    expect(unsafeEntryIssue(scan, '')?.message).toBe(
      'The archive entry "a/b/l" is a symbolic link to "d/../escaped", which leaves the plugin directory',
    );
  });

  test('a chain that stays inside is fine, and one that loops is refused', () => {
    const inside = { entries: [link('p/a/d', 'x/y'), link('p/a/l', 'd/../z')] };
    expect(unsafeEntryIssue(inside, 'p')).toBeUndefined();
    const loop = { entries: [link('p/a', 'b'), link('p/b', 'a'), link('p/c', 'a/f')] };
    expect(unsafeEntryIssue(loop, 'p')?.message).toContain('leaves the plugin directory');
  });

  test('an entry written through a link is refused, a file and a link alike', () => {
    for (const path of ['p/l/payload', 'p/l/sub/']) {
      const scan = { entries: [link('p/l', 'a'), file(path)] };
      expect(unsafeEntryIssue(scan, 'p')?.message).toBe(
        `The archive entry "${path}" is written through the symbolic link "p/l"`,
      );
    }
    const throughLink = { entries: [link('p/l', 'a'), link('p/l/m', 'x')] };
    expect(unsafeEntryIssue(throughLink, 'p')?.message).toBe(
      'The archive entry "p/l/m" is written through the symbolic link "p/l"',
    );
  });

  test('a link is found by a name that differs in letter case, where a file system folds names', () => {
    // The archive of the audit: on APFS `a/B` is created through the link `A`, and `b/…` through it.
    const planted = {
      entries: [
        file('skills/x.md'),
        link('A', '.'),
        link('a/B', '..'),
        link('b/planted-outside/file.txt', '../plugin/skills/x.md'),
      ],
    };
    expect(unsafeEntryIssue(planted, '')?.message).toBe(
      'The archive entry "a/B" is written through the symbolic link "A"',
    );
    const chain = { entries: [link('a/b/D', '../..'), link('a/b/l', 'd/../escaped')] };
    expect(unsafeEntryIssue(chain, '')?.message).toBe(
      'The archive entry "a/b/l" is a symbolic link to "d/../escaped", which leaves the plugin directory',
    );
  });

  test('a link is found by a name that differs in normalization, or in trailing dots and spaces', () => {
    const composed = 'caf\u00e9';
    const decomposed = 'cafe\u0301';
    for (const [stored, written] of [
      [composed, decomposed],
      [decomposed, composed],
      ['l', 'l.'],
      ['l', 'l '],
      ['Stra\u00dfe', 'STRASSE'],
    ] as const) {
      const scan = { entries: [link(`p/${stored}`, 'a'), file(`p/${written}/payload`)] };
      expect(unsafeEntryIssue(scan, 'p')?.message).toBe(
        `The archive entry "p/${written}/payload" is written through the symbolic link "p/${stored}"`,
      );
    }
  });

  test('a link that shares its name with another entry is refused, whichever comes first', () => {
    // Which of the two a host ends up with depends on its file system and on how it extracts.
    const sharing = [
      [link('p/Q', 'sub'), file('p/q')],
      [file('p/q'), link('p/Q', 'sub')],
      [link('p/Q', 'sub'), link('p/Q', '.')],
      [link('p/Q', 'sub'), file('p/Q/')],
    ];
    for (const entries of sharing) {
      const [first, second] = entries.map((entry) => entry.path);
      expect(unsafeEntryIssue({ entries }, 'p')?.message).toBe(
        `The archive entry "${first}" names the same file as "${second}", and one of them is a symbolic link`,
      );
    }
  });

  test('names that differ only in letter case are fine when no link is among them', () => {
    const scan = {
      entries: [file('p/README'), file('p/readme'), file('p/Docs/a'), file('p/docs/b')],
    };
    expect(unsafeEntryIssue(scan, 'p')).toBeUndefined();
  });

  test('a link with no target is refused', () => {
    expect(unsafeEntryIssue({ entries: [link('p/l')] }, 'p')?.message).toBe(
      'The archive entry "p/l" is a symbolic link with no target',
    );
  });

  test('fetching refuses a zip with such an entry before anything is extracted', async () => {
    const scan = {
      entries: [file('.claude-plugin/'), file('skills/a'), link('skills/l', '../../x')],
    };
    const issue = await refusal(fetchWith([zipOf(1000)], { scan }));
    expect(issue.message).toContain('leaves the plugin directory');
  });

  test('a plugin one directory down is judged against that directory', async () => {
    const scan = {
      entries: [file('wrap/'), file('wrap/skills/a'), link('wrap/skills/l', '../../x')],
    };
    const issue = await refusal(fetchWith([zipOf(1000)], { scan }));
    expect(issue.message).toContain('"wrap/skills/l"');
  });
});
