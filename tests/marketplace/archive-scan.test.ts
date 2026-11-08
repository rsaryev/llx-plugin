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
