/**
 * permissions.md § Bash > Wrappers and § Exec wrappers and `find` actions: "Before matching Bash
 * rules, Claude Code strips a fixed set of wrappers, so a rule like `Bash(npm test *)` also matches
 * `timeout 30 npm test`. The stripped wrappers are `timeout`, `time`, `nice`, `nohup`, and
 * `stdbuf`, plus the shell builtins `command` and `builtin`, and zsh's `noglob`." Two forms are not
 * stripped (`command -v`, `nocorrect`); known-safe environment assignments are stripped, an allow
 * rule does not match past any other, a deny or ask rule matches past any; bare `xargs` is
 * stripped, `xargs -n1 grep` is not; environment runners are not in the list. "A prefix rule like
 * `Bash(watch *)` or `Bash(find *)` can't auto-approve" exec wrappers and a `find` that runs
 * commands, deletes or writes, or reads `-files0-from`; an exact-match rule can.
 *
 * No requirement id covers these sections, so none of it is under spec(). The option grammar of
 * each wrapper, and the safe environment variables beyond the three the docs name, are rows in
 * spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { requiresPromptDespitePrefixRule } from '../../src/rules/bash/exec-wrappers.ts';
import { stripWrappers } from '../../src/rules/bash/wrappers.ts';
import { matchContext } from '../support/rule-context.ts';
import { allows, denies } from '../support/bash-rules.ts';
import { spec } from '../support/spec.ts';

spec(['permissions.behavior.Wrappers'], () => {
  test.each([
    'timeout 30 npm test',
    'time npm test',
    'nice npm test',
    'nohup npm test',
    'stdbuf npm test',
    'command npm test',
    'builtin npm test',
    'noglob npm test',
  ])('Bash(npm test *) matches %j', (command) => {
    expect(allows('Bash(npm test *)', command)).toBe(true);
    expect(denies('Bash(npm test *)', command)).toBe(true);
  });

  test('wrappers stack, and each keeps its own options', () => {
    for (const command of [
      'timeout -s KILL 30 nice -n 5 nohup npm test',
      'timeout --kill-after=5 30 npm test',
      'time -p npm test',
      'stdbuf -oL -eL npm test',
      'nice -10 npm test',
      'command -p npm test',
      'timeout -- 30 npm test',
    ]) {
      expect([command, stripWrappers(command, 'deny')]).toEqual([command, 'npm test']);
    }
  });

  test('the command the wrapper runs is what is left, as written', () => {
    expect(stripWrappers("timeout 30 npm test 'a b'", 'allow')).toBe("npm test 'a b'");
  });

  test('a wrapper with nothing to run is left alone', () => {
    expect(stripWrappers('timeout 30', 'allow')).toBe('timeout 30');
    expect(stripWrappers('nohup', 'allow')).toBe('nohup');
  });

  test('command -v looks a command up instead of running it, and nocorrect is not stripped', () => {
    expect(stripWrappers('command -v git', 'deny')).toBe('command -v git');
    expect(stripWrappers('command -V git', 'deny')).toBe('command -V git');
    expect(denies('Bash(git *)', 'command -v git')).toBe(false);
    expect(denies('Bash(git *)', 'nocorrect git status')).toBe(false);
    expect(denies('Bash(git *)', 'command git status')).toBe(true);
  });
});

describe('leading environment assignments', () => {
  test('a known-safe variable is stripped, so Bash(npm test *) matches NODE_ENV=test npm test', () => {
    for (const variable of ['NODE_ENV=test', 'LANG=C', 'NO_COLOR=1']) {
      expect([variable, allows('Bash(npm test *)', `${variable} npm test`)]).toEqual([
        variable,
        true,
      ]);
    }
  });

  test('an allow rule does not match past an assignment of any other variable', () => {
    expect(allows('Bash(npm test *)', 'FOO=bar npm test')).toBe(false);
    expect(allows('Bash(npm test *)', 'NODE_ENV=test FOO=bar npm test')).toBe(false);
  });

  test('a deny or ask rule matches past any leading assignment: Bash(rm *) still matches FOO=bar rm -rf tmp/', () => {
    expect(denies('Bash(rm *)', 'FOO=bar rm -rf tmp/')).toBe(true);
    expect(denies('Bash(rm *)', 'A=1 B="x y" rm -rf tmp/')).toBe(true);
  });

  test('a host adds the variables it knows are safe', () => {
    const ctx = { ...matchContext, safeEnvVars: new Set(['CI']) };
    expect(allows('Bash(npm test *)', 'CI=1 npm test', ctx)).toBe(true);
    expect(allows('Bash(npm test *)', 'CI=1 npm test')).toBe(false);
  });

  test('a safe assignment wraps a wrapper and the other way round', () => {
    expect(allows('Bash(npm test *)', 'NODE_ENV=test timeout 30 npm test')).toBe(true);
    expect(allows('Bash(npm test *)', 'timeout 30 NODE_ENV=test npm test')).toBe(true);
  });
});

describe('xargs and environment runners', () => {
  test('bare xargs is stripped: Bash(grep *) matches xargs grep pattern', () => {
    expect(allows('Bash(grep *)', 'xargs grep pattern')).toBe(true);
  });

  test('xargs with a flag is matched as an xargs command, so rules for the inner command do not cover it', () => {
    expect(allows('Bash(grep *)', 'xargs -n1 grep pattern')).toBe(false);
    expect(allows('Bash(xargs *)', 'xargs -n1 grep pattern')).toBe(true);
    expect(stripWrappers('xargs -n1 grep pattern', 'deny')).toBe('xargs -n1 grep pattern');
  });

  test.each([
    'direnv exec . rm -rf .',
    'devbox run rm -rf .',
    'mise exec -- rm -rf .',
    'npx rm -rf .',
    'docker exec box rm -rf .',
  ])('%j is not stripped: the runner is what a rule sees', (command) => {
    expect(denies('Bash(rm *)', command)).toBe(false);
  });

  test('Bash(devbox run *) matches whatever comes after run, so a specific rule names the inner command', () => {
    expect(allows('Bash(devbox run *)', 'devbox run rm -rf .')).toBe(true);
    expect(allows('Bash(devbox run npm test)', 'devbox run npm test')).toBe(true);
    expect(allows('Bash(devbox run npm test)', 'devbox run rm -rf .')).toBe(false);
  });
});

spec(['permissions.behavior.Exec wrappers and find actions'], () => {
  test.each(['watch ls', 'setsid ls', 'ionice -c3 ls', 'flock /tmp/l ls'])(
    'a prefix rule cannot approve %j',
    (command) => {
      const name = command.split(' ')[0];
      expect(requiresPromptDespitePrefixRule(command)).toBe(true);
      expect(allows(`Bash(${name} *)`, command)).toBe(false);
      expect(allows(`Bash(${command})`, command)).toBe(true);
    },
  );

  test.each([
    'find . -exec rm {} \\;',
    'find . -delete',
    'find . -rm',
    'find . -fprint out.txt',
    'find . -files0-from list.txt',
  ])('a prefix rule cannot approve %j', (command) => {
    expect(requiresPromptDespitePrefixRule(command)).toBe(true);
    expect(allows('Bash(find *)', command)).toBe(false);
  });

  test('a find without such an action is an ordinary command', () => {
    expect(requiresPromptDespitePrefixRule('find . -name x -type f')).toBe(false);
    expect(allows('Bash(find *)', 'find . -name x -type f')).toBe(true);
  });

  test('"To approve a specific invocation that has no * in it, write an exact-match rule"', () => {
    expect(allows('Bash(find build -type f -delete)', 'find build -type f -delete')).toBe(true);
  });

  test('a command with a * is read as a wildcard pattern, so it still prompts', () => {
    expect(allows("Bash(find . -name '*.tmp' -delete)", "find . -name '*.tmp' -delete")).toBe(
      false,
    );
  });

  test('a wrapper in front does not hide the exec wrapper or the find action', () => {
    expect(allows('Bash(timeout *)', 'timeout 5 find . -delete')).toBe(false);
    expect(allows('Bash(find *)', 'timeout 5 find . -delete')).toBe(false);
  });

  test('the same prefix rule as a deny or ask rule still matches', () => {
    expect(denies('Bash(find *)', 'find . -delete')).toBe(true);
    expect(denies('Bash(watch *)', 'watch ls')).toBe(true);
  });
});
