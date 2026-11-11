/** settings-reference.md § Sandboxed commands under the block. */
import { expect, test } from 'bun:test';
import {
  BLOCKED_USER_ROOTS,
  gitConfigReopened,
  sandboxReadBlock,
} from '../../../src/settings/permissions/index.ts';
import { spec } from '../../support/spec.ts';

const base = {
  blockReads: true,
  filesystemDisabled: false,
  managedReadPathsOnly: false,
  startDirectory: '/work/app',
  home: '/home/alice',
};

spec('permissions.reference.Sandboxed commands under the block', () => {
  test('the block denies sandboxed commands the home directory and the roots that hold user files', () => {
    const block = sandboxReadBlock(base);
    expect(block.reachesSandbox).toBe(true);
    expect(block.denyRead).toEqual(['/home/alice', ...BLOCKED_USER_ROOTS]);
    expect(BLOCKED_USER_ROOTS).toEqual([
      '/Users',
      '/home',
      '/root',
      '/Volumes',
      '/mnt',
      '/media',
      '/run/media',
      '/srv',
    ]);
    expect(block.repositoryAllowEntriesCount).toBe(false);
  });
  test.each([
    ['no block key', { blockReads: false }],
    ['filesystem isolation off', { filesystemDisabled: true }],
    ['allowManagedReadPathsOnly', { managedReadPathsOnly: true }],
    ['a glob character in the start directory', { startDirectory: '/work/app[1]' }],
  ])('it does not reach sandboxed commands with %s', (_name, change) => {
    const block = sandboxReadBlock({ ...base, ...change });
    expect(block.reachesSandbox).toBe(false);
    expect(block.denyRead).toEqual([]);
    expect(block.repositoryAllowEntriesCount).toBe(true);
  });
  test('the global git configuration is re-opened, file by file', () => {
    const files = gitConfigReopened({
      home: '/home/alice',
      included: ['/home/alice/.gitconfig-work'],
      writable: new Set(['/home/alice/.gitconfig-work']),
      denyRead: [],
    });
    expect(files).toEqual([
      '/home/alice/.gitconfig',
      '/home/alice/.config/git/config',
      '/home/alice/.config/git/ignore',
      '/home/alice/.config/git/attributes',
    ]);
  });
  test('XDG_CONFIG_HOME moves the directory, and a denyRead entry wins over the re-open', () => {
    const files = gitConfigReopened({
      home: '/home/alice',
      xdgConfigHome: '/cfg',
      included: [],
      writable: new Set(),
      denyRead: ['/cfg/git/config', '/home/alice/.gitconfig'],
    });
    expect(files).toEqual(['/cfg/git/ignore', '/cfg/git/attributes']);
  });
});
