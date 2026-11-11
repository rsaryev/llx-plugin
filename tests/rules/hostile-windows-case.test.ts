/**
 * Windows paths, hostile spellings: Windows compares names without case and drops the dots and
 * spaces that end a name, so `C:\users\alice`, `.GIT` and `.git.` are the paths they look like to
 * the file system. permissions.md § Protected paths and the working directories read them that way.
 */
import { describe, expect, test } from 'bun:test';
import { deny, onPath, pathsWith, rulesOf } from '../support/decide.ts';
import { spec } from '../support/spec.ts';

const match = pathsWith({
  platform: 'windows',
  cwd: 'C:\\work\\app',
  home: 'C:\\Users\\alice',
  primaryWorkingDirectory: 'C:\\work\\app',
});

spec('permissions.modes.Protected paths', () => {
  test('a protected directory or file in another case, or with a trailing dot or space, is protected', () => {
    for (const path of [
      'C:\\work\\app\\.GIT\\config',
      'C:\\work\\app\\.Git\\hooks\\pre-commit',
      'C:\\work\\app\\.git.\\config',
      'C:\\work\\app\\.git \\config',
      'C:\\work\\app\\.Claude\\settings.json',
      'C:\\work\\app\\.BASHRC',
      'C:\\work\\app\\.bashrc.',
      'C:\\work\\app\\.VSCode\\tasks.json',
    ]) {
      expect({ path, outcome: onPath('acceptEdits', 'Edit', path, { match }).outcome }).toEqual({
        path,
        outcome: 'ask',
      });
    }
  });
});

describe('Windows paths compare without case', () => {
  test('a deny rule anchored at the home directory covers another case of it', () => {
    const rules = rulesOf(['deny', 'Read(~/.ssh/**)']);
    expect(
      onPath('bypassPermissions', 'Read', 'C:\\users\\ALICE\\.ssh\\id_rsa', { rules, match }),
    ).toEqual(deny('deny-rule'));
    expect(
      onPath('bypassPermissions', 'Read', 'C:\\Users\\alice\\.SSH\\id_rsa', { rules, match }),
    ).toEqual(deny('deny-rule'));
  });

  test('the working directory in another case is the working directory', () => {
    expect(onPath('acceptEdits', 'Edit', 'c:\\WORK\\App\\src\\a.ts', { match }).outcome).toBe(
      'allow',
    );
    expect(onPath('default', 'Read', 'C:\\Work\\APP\\src\\a.ts', { match }).outcome).toBe('allow');
  });
});
