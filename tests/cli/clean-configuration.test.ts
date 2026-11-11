/**
 * debug-your-config.md § Test against a clean configuration: the empty directory, the fresh
 * `CLAUDE_CONFIG_DIR`, `--setting-sources user`, and what "Problem gone" and "Problem persists" mean.
 */
import { expect, test } from 'bun:test';
import { afterCleanRun, cleanLaunch, cleanLaunchCommands } from '../../src/cli/index.ts';
import { spec } from '../support/spec.ts';

spec('cli.debug.Test against a clean configuration', () => {
  test('the launch runs in an empty directory with a fresh config directory and user setting sources only', () => {
    const launch = cleanLaunch('/home/u');
    expect(launch.directory).toBe('/home/u/claude-clean/empty');
    expect(launch.env).toEqual({ CLAUDE_CONFIG_DIR: '/home/u/claude-clean/config' });
    expect(launch.args).toEqual(['--setting-sources', 'user']);
  });

  test('the documented commands, for Bash or Zsh and for PowerShell', () => {
    expect(cleanLaunchCommands('posix')).toEqual({
      create: 'mkdir -p ~/claude-clean/empty && cd ~/claude-clean/empty',
      launch: 'CLAUDE_CONFIG_DIR=~/claude-clean/config claude --setting-sources user',
    });
    expect(cleanLaunchCommands('powershell').launch).toContain('$env:CLAUDE_CONFIG_DIR');
  });
});

spec('cli.debug.Test against a clean configuration.Problem gone', () => {
  test('the cause is in user or project configuration: copy files back one at a time', () => {
    const next = afterCleanRun('problem-gone');
    expect(next.cause).toBe('user-or-project-configuration');
    expect(next.next[0]).toContain('one at a time');
  });
});

spec('cli.debug.Test against a clean configuration.Problem persists', () => {
  test('the cause is outside: check /status and the environment variables', () => {
    const next = afterCleanRun('problem-persists');
    expect(next.cause).toBe('outside-user-and-project-configuration');
    expect(next.next.join(' ')).toContain('/status');
    expect(next.next.join(' ')).toContain('environment variables');
  });
});
