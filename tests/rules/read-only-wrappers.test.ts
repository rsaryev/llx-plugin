/**
 * What the read-only set sees through, as Claude Code 2.1.322 did in the Bash tool and in a skill's
 * `!` block alike (spec/judgments.md): known-safe assignments with a value each accepts, `noglob`,
 * `command` and `builtin`, and `timeout` with a bare duration, in that order. Everything else in
 * front of a read-only command is asked, `nice`, `time`, `nohup`, `stdbuf` and `xargs` included,
 * and `git` and `cd` are read-only only as written. The allow rules strip by the same safe
 * variables (permissions.md, "Bash > Wrappers").
 */
import { describe, expect, test } from 'bun:test';
import { allow, ask, bash } from '../support/decide.ts';
import { allows } from '../support/bash-rules.ts';

const RUNS = allow('read-only-command');
const PROMPTS = ask('default-prompt');
const runs = (command: string) =>
  expect([command, bash('default', command)]).toEqual([command, RUNS]);
const prompts = (command: string) =>
  expect([command, bash('default', command)]).toEqual([command, PROMPTS]);

describe('safe assignments', () => {
  test('a locale is C, POSIX, empty or UTF-8', () => {
    for (const value of [
      'C',
      'POSIX',
      'C.UTF-8',
      'C.utf8',
      'en_US.UTF-8',
      'de_DE.utf8',
      '',
      "'C'",
    ]) {
      runs(`LANG=${value} ls`);
    }
    runs('LANG=en_US.UTF-8@euro LC_ALL=C LC_CTYPE=C ls');
    for (const value of [
      'x',
      'en',
      'en_US',
      '1',
      'en_US.ISO-8859-1',
      'sr_RS@latin',
      '"en US"',
      '$X',
    ]) {
      prompts(`LANG=${value} ls`);
    }
    prompts('LC_CTYPE=1 ls');
  });

  test('the variables with any value, the integers and the zone', () => {
    for (const each of ['TERM=dumb', 'TZ=America/New_York', 'CI=1', 'NO_COLOR=1', 'GOOS=linux']) {
      runs(`${each} ls`);
    }
    runs('COLUMNS=80 LINES=24 ls');
    prompts('COLUMNS=wide ls');
    prompts('TZ=../../etc ls');
  });

  test('any other variable is asked', () => {
    for (const name of [
      'FOO',
      'HOME',
      'PATH',
      'PAGER',
      'GIT_PAGER',
      'LC_MESSAGES',
      'NODE_OPTIONS',
    ]) {
      prompts(`${name}=x ls`);
    }
  });

  test('an assignment on its own, or before a later command, is asked', () => {
    prompts('LANG=C');
    prompts('LANG=C; ls');
  });
});

describe('wrappers', () => {
  test('noglob, command, builtin and timeout with a duration', () => {
    for (const command of [
      'noglob ls',
      'command ls',
      'command -p ls',
      'command -- ls',
      'builtin ls',
      'timeout 5 ls',
      'timeout 0.5 cat a.txt',
      'timeout 1m ls',
    ]) {
      runs(command);
    }
    prompts('command -v ls');
    prompts('timeout 5x ls');
    prompts('timeout -s KILL 5 ls');
    prompts('timeout --foreground 5 ls');
  });

  test('stacked in order, never back to an earlier stage', () => {
    for (const command of [
      'noglob command ls',
      'command command ls',
      'builtin command ls',
      'command timeout 5 ls',
      'timeout 5 timeout 5 ls',
      'LANG=C noglob command timeout 5 ls',
    ]) {
      runs(command);
    }
    for (const command of [
      'command noglob ls',
      'timeout 5 command ls',
      'timeout 5 noglob ls',
      'command LANG=C ls',
      'timeout 5 LANG=C ls',
    ]) {
      prompts(command);
    }
  });

  test('the wrappers the read-only set does not strip are asked', () => {
    for (const wrapper of [
      'nice',
      'nice -n 5',
      'time',
      'nohup',
      'stdbuf -o0',
      'xargs',
      'env',
      'exec',
    ]) {
      prompts(`${wrapper} ls`);
    }
  });

  test('git and cd behind anything are asked', () => {
    runs('git status');
    for (const command of ['LANG=C git status', 'command git status', 'timeout 5 git status']) {
      prompts(command);
    }
    prompts('timeout 5 cd /work/app');
  });
});

describe('allow rules strip the same safe variables', () => {
  test('LC_CTYPE=C passes Bash(echo hi), LANG=x and an unknown variable do not', () => {
    expect(allows('Bash(echo hi)', 'LC_CTYPE=C echo hi')).toBe(true);
    expect(allows('Bash(echo hi)', 'LANG=x echo hi')).toBe(false);
    expect(allows('Bash(echo hi)', 'DEBUG=1 echo hi')).toBe(false);
  });
});
