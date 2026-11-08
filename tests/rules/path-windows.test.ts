/**
 * permissions.md § Where a pattern anchors: "On Windows, paths are normalized to POSIX form before
 * matching. `C:\Users\alice` becomes `/c/Users/alice`, so use `//c/**\/.env` to match `.env` files
 * anywhere on that drive. To match across all drives, use `//**\/.env`." The anchors (cwd, home,
 * primary working directory, a `--settings` file) are normalised the same way. No requirement id
 * covers this, so none of it is under spec(); the case rule is a row in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { isNetworkPath } from '../../src/rules/index.ts';
import { denies, allows, withPaths } from '../support/path-rules.ts';
import { spec } from '../support/spec.ts';

const ctx = withPaths({
  platform: 'windows',
  cwd: 'C:\\work\\app',
  home: 'C:\\Users\\alice',
  primaryWorkingDirectory: 'C:\\work\\app',
});
const on = { ctx };

describe('Windows paths are matched in POSIX form', () => {
  test('//c/**/.env matches .env files anywhere on the C drive, and only there', () => {
    expect(denies('Read(//c/**/.env)', 'C:\\work\\app\\.env', on)).toBe(true);
    expect(denies('Read(//c/**/.env)', 'C:\\Users\\alice\\.env', on)).toBe(true);
    expect(denies('Read(//c/**/.env)', 'D:\\data\\.env', on)).toBe(false);
  });

  test('//**/.env matches across all drives', () => {
    expect(denies('Read(//**/.env)', 'C:\\work\\app\\.env', on)).toBe(true);
    expect(denies('Read(//**/.env)', 'D:\\data\\.env', on)).toBe(true);
  });

  test('a path written with forward slashes and a lower-case drive is the same path', () => {
    expect(denies('Read(//c/work/app/.env)', 'c:/work/app/.env', on)).toBe(true);
    expect(denies('Read(//c/work/app/.env)', 'C:\\work\\app\\.env', on)).toBe(true);
  });

  test('the current directory, the home directory and the primary directory are normalised', () => {
    expect(denies('Read(.env)', 'C:\\work\\app\\sub\\.env', on)).toBe(true);
    expect(denies('Read(~/.ssh/**)', 'C:\\Users\\alice\\.ssh\\id_rsa', on)).toBe(true);
    expect(denies('Edit(/src/**)', 'C:\\work\\app\\src\\a.ts', { ...on, tool: 'Edit' })).toBe(true);
    expect(denies('Edit(/src/**)', 'C:\\work\\other\\src\\a.ts', { ...on, tool: 'Edit' })).toBe(
      false,
    );
  });

  test('a --settings file on a drive anchors /path at its directory', () => {
    const source = { kind: 'flag-settings', file: 'D:\\policy\\team.json' } as const;
    expect(denies('Read(/secrets/**)', 'D:\\policy\\secrets\\k', { ...on, source })).toBe(true);
    expect(denies('Read(/secrets/**)', 'C:\\work\\app\\secrets\\k', { ...on, source })).toBe(false);
  });

  test('a relative path is resolved against the current directory', () => {
    expect(denies('Read(.env)', 'sub\\.env', on)).toBe(true);
    expect(denies('Read(.env)', '..\\.env', on)).toBe(false);
  });
});

describe('case on Windows (a judgment: the docs are silent)', () => {
  test('a Windows path rule ignores case; a POSIX one does not', () => {
    expect(allows('Read(src/**)', 'C:\\work\\app\\SRC\\A.ts', on)).toBe(true);
    expect(allows('Read(src/**)', '/work/app/SRC/A.ts')).toBe(false);
  });
});

spec(
  [
    'permissions.behavior.Network paths.Windows',
    'permissions.behavior.Network paths.macOS and Linux',
  ],
  () => {
    test('a UNC path is a network path on Windows', () => {
      expect(isNetworkPath('\\\\server\\share\\file', 'windows')).toBe(true);
      expect(isNetworkPath('//server/share/file', 'windows')).toBe(true);
      expect(isNetworkPath('C:\\work\\file', 'windows')).toBe(false);
    });

    test('a /net automount path is a network path on macOS and Linux', () => {
      expect(isNetworkPath('/net/fileserver/notes.txt', 'posix')).toBe(true);
      expect(isNetworkPath('/net', 'posix')).toBe(true);
      expect(isNetworkPath('/network/x', 'posix')).toBe(false);
      expect(isNetworkPath('//server/share', 'posix')).toBe(false);
    });
  },
);
