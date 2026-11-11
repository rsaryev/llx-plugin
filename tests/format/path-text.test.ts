/**
 * The one owner of path text (`src/format/path-text.ts`) and the path bugs it fixed: a link
 * target on Windows judged by its drive (#2), `.//etc` read as `/etc` (#3), a link crossed by an
 * ancestor folder (#9), and a Windows backslash in a `PluginFiles` path (#11).
 */
import { describe, expect, test } from 'bun:test';
import {
  escapesAsWritten,
  isAbsolutePath,
  isWithin,
  leavesFolder,
  resolveFrom,
  resolveSegments,
  rootRelative,
  withoutTrailingSlashes,
} from '../../src/format/path-text.ts';
import { escapedPathIssue } from '../../src/format/path-escape.ts';
import { locate } from '../../src/format/locate.ts';
import { parsePluginSource } from '../../src/format/marketplace/plugin-source.ts';
import { memoryFiles } from '../support/ports.ts';

describe('path text', () => {
  test('absolute paths: a root slash, a backslash, or a drive', () => {
    expect(['/x', '\\x', 'C:', 'c:/x', 'C:\\x'].map(isAbsolutePath)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(isAbsolutePath('./x')).toBe(false);
  });

  test('segments resolve `.`, empty and `..`; climbing above the start is undefined', () => {
    expect(resolveSegments('./a//b/../c', 'posix')).toEqual(['a', 'c']);
    expect(resolveSegments('a/../../x', 'posix')).toBeUndefined();
    expect(resolveSegments('a\\..\\..\\x', 'windows')).toBeUndefined();
    expect(resolveSegments('a\\..\\..\\x', 'posix')).toEqual(['a\\..\\..\\x']);
  });

  test('a path leaves its folder when absolute or when it climbs above it', () => {
    expect(leavesFolder('../x', 'posix')).toBe(true);
    expect(leavesFolder('a/../../x', 'posix')).toBe(true);
    expect(leavesFolder('a/../x', 'posix')).toBe(false);
    expect(leavesFolder('C:/x', 'posix')).toBe(true);
  });

  test('as written, any `..`, an absolute path or a POSIX backslash escapes', () => {
    expect(escapesAsWritten('./a/../b', 'posix')).toBe(true);
    expect(escapesAsWritten('./a\\b', 'posix')).toBe(true);
    expect(escapesAsWritten('./a\\b', 'windows')).toBe(false);
    expect(escapesAsWritten('..\\b', 'windows')).toBe(true);
  });

  test('#11: a Windows backslash separates in the root-relative spelling', () => {
    expect(rootRelative('.\\commands\\a.md', 'windows')).toBe('commands/a.md');
    expect(rootRelative('.//x/./y/')).toBe('x/y');
    expect(rootRelative('./')).toBe('.');
  });

  test('resolveFrom joins a relative path to the root and keeps an absolute one in / spelling', () => {
    expect(resolveFrom('/m/p/', '../q/x', 'posix')).toBe('/m/q/x');
    expect(resolveFrom('C:/m/p', 'C:\\other\\x', 'windows')).toBe('C:/other/x');
  });

  test('isWithin compares whole segments', () => {
    expect(isWithin('/m/p', '/m/p/x')).toBe(true);
    expect(isWithin('/m/p', '/m/px')).toBe(false);
    expect(isWithin('/m/p/', '/m/p')).toBe(true);
  });

  test('withoutTrailingSlashes drops every trailing slash and nothing else', () => {
    expect(withoutTrailingSlashes('a/b//')).toBe('a/b');
    expect(withoutTrailingSlashes('a\\')).toBe('a\\');
    expect(withoutTrailingSlashes('/')).toBe('');
    expect(withoutTrailingSlashes('a')).toBe('a');
  });
});

const WINDOWS_ROOTS = { pluginRoot: 'C:/m/plugins/p', marketplaceRoot: 'C:/m' };
const issue = (resolvesTo: string) =>
  escapedPathIssue({
    component: 'commands',
    written: './x.md',
    platform: 'windows',
    resolvesTo,
    roots: WINDOWS_ROOTS,
  });

describe('path bugs', () => {
  test('#2: a link target on another drive, or spelled with backslashes, leaves the plugin', () => {
    expect(issue('D:/elsewhere/x.md')?.severity).toBe('error');
    expect(issue('C:\\elsewhere\\x.md')?.severity).toBe('error');
    expect(issue('C:\\m\\plugins\\other\\x.md')).toBeUndefined();
    expect(issue('C:\\m\\plugins\\p\\x.md')).toBeUndefined();
  });

  test('#3: `.//etc` is the folder `etc` below the marketplace, not `/etc`', () => {
    const read = parsePluginSource('.//etc', { index: 0, context: { platform: 'posix' } });
    expect(read.source).toEqual({ kind: 'relative', path: 'etc', bare: false });
  });

  test('#9: a declared path below a symlinked folder that leads outside does not load', async () => {
    const files = memoryFiles({ commands: { symlink: '/home/user/shared' } });
    const found = await locate(
      { files, platform: 'posix', roots: { pluginRoot: '/m/plugins/p', marketplaceRoot: '/m' } },
      'commands',
      './commands/deploy.md',
    );
    expect(found.issue?.message).toBe(
      'commands path escapes plugin directory: ./commands/deploy.md — it resolves to /home/user/shared/deploy.md, outside the plugin directory',
    );
  });

  test('#9: a path below a symlinked folder inside the plugin loads through the link', async () => {
    const files = memoryFiles({ 'real/deploy.md': 'x', commands: { symlink: 'real' } });
    const found = await locate({ files, platform: 'posix' }, 'commands', './commands/deploy.md');
    expect(found.issue).toBeUndefined();
    expect(found.stat?.isFile).toBe(true);
  });
});
