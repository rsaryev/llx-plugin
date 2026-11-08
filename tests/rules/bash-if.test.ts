/**
 * hooks.md § Common fields (`if`) and § How `if` patterns match Bash commands: "Leading `VAR=value`
 * assignments are stripped before matching", the five-row table (pattern, command, whether the hook
 * runs, why) and "When Claude Code can't determine which commands the Bash input runs, it runs your
 * hook regardless of the pattern"; § Match Monitor commands: `Monitor(tail *)` "matches by the
 * rules `Bash(tail *)` follows".
 *
 * `hooks.handler.common.if` is proven by the hooks sub-package, which owns the event gating ("Only
 * evaluated on tool events"); these tests are the Bash half it consumes through `evaluateIf`, so
 * none of it is under spec(). What the docs leave open (an unreadable rule, the shape of "specifies
 * more than the command name") is a row in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { evaluateIf } from '../../src/rules/bash/if-eval.ts';
import { matchContext } from '../support/rule-context.ts';

const runs = (ifRule: string, toolName: string, input: unknown): boolean =>
  evaluateIf(ifRule, toolName, input, matchContext).runs;
const bash = (ifRule: string, command: string): boolean => runs(ifRule, 'Bash', { command });

describe('the documented table', () => {
  test('Bash(git *) runs for FOO=bar git push: leading assignments are stripped', () => {
    expect(bash('Bash(git *)', 'FOO=bar git push')).toBe(true);
  });

  test('Bash(git *) runs for npm test && git push: each subcommand is checked', () => {
    expect(bash('Bash(git *)', 'npm test && git push')).toBe(true);
  });

  test('Bash(rm *) runs for echo $(rm -rf /): commands inside $() are checked', () => {
    expect(bash('Bash(rm *)', 'echo $(rm -rf /)')).toBe(true);
    expect(bash('Bash(rm *)', 'echo `rm -rf /`')).toBe(true);
  });

  test('Bash(rm *) does not run for echo $(date): no subcommand matches', () => {
    expect(bash('Bash(rm *)', 'echo $(date)')).toBe(false);
  });

  test('Bash(git push *) runs for echo $(date): a pattern that says more than the command name runs on $(), backticks or $VAR', () => {
    expect(bash('Bash(git push *)', 'echo $(date)')).toBe(true);
    expect(bash('Bash(git push *)', 'echo `date`')).toBe(true);
    expect(bash('Bash(git push *)', 'echo $HOME')).toBe(true);
    expect(bash('Bash(git push *)', 'echo ${HOME}')).toBe(true);
  });
});

describe('a pattern filters when the commands are known', () => {
  test('no subcommand matches, no substitution: the hook does not run', () => {
    expect(bash('Bash(git push *)', 'npm test')).toBe(false);
    expect(bash('Bash(git push *)', 'git status && echo done')).toBe(false);
    expect(bash('Bash(git push *)', "echo '$HOME'")).toBe(false);
  });

  test('a pattern that is only the command name does not run on a substitution that is not a match', () => {
    expect(bash('Bash(rm *)', 'echo $HOME')).toBe(false);
    expect(bash('Bash(rm)', 'echo $(date)')).toBe(false);
  });

  test('a bare tool name runs for every call, and Bash(*) is the bare tool name', () => {
    expect(bash('Bash', 'anything')).toBe(true);
    expect(bash('Bash(*)', 'anything')).toBe(true);
  });
});

describe('when the commands cannot be determined the hook runs regardless of the pattern', () => {
  test('an unparseable command', () => {
    expect(bash('Bash(rm *)', 'npm test &&')).toBe(true);
    expect(bash('Bash(rm *)', 'echo "unterminated')).toBe(true);
  });

  test('an input that holds no command string', () => {
    expect(runs('Bash(rm *)', 'Bash', {})).toBe(true);
    expect(runs('Bash(rm *)', 'Bash', { command: 3 })).toBe(true);
    expect(runs('Bash(rm *)', 'Bash', undefined)).toBe(true);
  });
});

describe('the tool name in the rule decides which tool it is about', () => {
  test('a rule that names another tool does not run', () => {
    expect(runs('Bash(rm *)', 'PowerShell', { command: 'rm x' })).toBe(false);
    expect(runs('Bash(rm *)', 'Monitor', { command: 'rm x' })).toBe(false);
    expect(runs('PowerShell(Remove-Item *)', 'Bash', { command: 'Remove-Item x' })).toBe(false);
  });

  test('Monitor(tail *) matches the Monitor call by the rules Bash(tail *) follows', () => {
    expect(runs('Monitor(tail *)', 'Monitor', { command: 'tail -f log.txt' })).toBe(true);
    expect(runs('Monitor(tail *)', 'Monitor', { command: 'cat log.txt' })).toBe(false);
    expect(runs('Monitor(tail *)', 'Monitor', { command: 'FOO=1 tail -f x | grep y' })).toBe(true);
  });

  test('PowerShell(Remove-Item *) filters PowerShell commands, aliases included', () => {
    expect(runs('PowerShell(Remove-Item *)', 'PowerShell', { command: 'Remove-Item x' })).toBe(
      true,
    );
    expect(runs('PowerShell(Remove-Item *)', 'PowerShell', { command: 'Get-Date' })).toBe(false);
    expect(runs('PowerShell(Get-ChildItem *)', 'PowerShell', { command: 'gci -r' })).toBe(true);
  });
});

describe('a rule the kit cannot read', () => {
  test('is reported as an issue and the hook still runs', () => {
    const result = evaluateIf('Bash(command:rm *)', 'Bash', { command: 'ls' }, matchContext);
    expect(result.runs).toBe(true);
    expect(result.issues.map((found) => found.severity)).toEqual(['warning']);
  });

  test('a good rule reports no issue', () => {
    expect(evaluateIf('Bash(git *)', 'Bash', { command: 'ls' }, matchContext).issues).toEqual([]);
  });
});
