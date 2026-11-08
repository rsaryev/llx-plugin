/**
 * Decisions the docs leave open about reading a Bash command (spec/judgments.md, rows for
 * `src/rules/bash`). Nothing here is under spec(): none of it counts as compatibility.
 */
import { describe, expect, test } from 'bun:test';
import { requiresPromptDespitePrefixRule } from '../../src/rules/bash/exec-wrappers.ts';
import { splitCommand } from '../../src/rules/bash/split.ts';
import { allows, asks, denies } from '../support/bash-rules.ts';

describe('a command the kit cannot read to the end', () => {
  test('is split as far as it goes, and a deny or ask rule still sees what was found', () => {
    expect(denies('Bash(rm *)', 'rm -rf build &&')).toBe(true);
    expect(asks('Bash(rm *)', 'echo "x" && rm y ||')).toBe(true);
  });

  test('an unclosed quote or substitution is unparseable, so no allow rule approves it', () => {
    for (const command of ['echo "a', "echo 'a", 'echo $(date', 'echo `date']) {
      expect([command, splitCommand(command).parseable]).toEqual([command, false]);
      expect([command, allows('Bash(echo *)', command)]).toEqual([command, false]);
    }
  });

  test('a deny rule matches the whole text of an unreadable command', () => {
    expect(denies('Bash(echo "a*)', 'echo "a')).toBe(true);
  });

  test('nesting beyond any real command is unparseable rather than a stack overflow', () => {
    const command = `${'$('.repeat(200)}date${')'.repeat(200)}`;
    expect(splitCommand(command).parseable).toBe(false);
  });
});

describe('a rule is tried against the command as written and after each wrapper is stripped', () => {
  test('a rule that names the wrapper itself matches the command as written', () => {
    expect(allows('Bash(timeout 30 npm test)', 'timeout 30 npm test')).toBe(true);
    expect(allows('Bash(timeout *)', 'timeout 30 npm test')).toBe(true);
  });

  test('an intermediate form matches too: nice before nohup', () => {
    expect(denies('Bash(nohup *)', 'nice -n 5 nohup make')).toBe(true);
  });
});

describe('shell syntax the splitter reads', () => {
  test('a quoted here-document body is text, not commands', () => {
    const command = "git commit -m \"$(cat <<'EOF'\nfix: rm -rf the cache\nit's done\nEOF\n)\"";
    expect(splitCommand(command).subcommands).toEqual([command, "cat <<'EOF'"]);
    expect(denies('Bash(rm *)', command)).toBe(false);
  });

  test('an unquoted here-document body is read as commands, since it expands $()', () => {
    expect(denies('Bash(rm *)', 'cat <<EOF\n$(rm -rf x)\nEOF')).toBe(true);
  });

  test('a command substituted inside ${...} or $((...)) runs', () => {
    expect(denies('Bash(rm *)', 'echo ${A:-$(rm -rf x)}')).toBe(true);
    expect(denies('Bash(rm *)', 'echo $(( $(rm -rf x) + 1 ))')).toBe(true);
    expect(denies('Bash(rm *)', 'echo ${A}')).toBe(false);
  });

  test('keywords stand before a command and are not commands: if, while, until, !, case', () => {
    for (const command of [
      'if rm x; then ls; fi',
      'while rm x; do ls; done',
      'until rm x; do ls; done',
      '! rm x',
      'case $x in a) rm x;; esac',
      'case $x in a) ls;; b|c) rm x;; esac',
    ]) {
      expect([command, denies('Bash(rm *)', command)]).toEqual([command, true]);
    }
    expect(splitCommand('for f in a b; do ls $f; done').subcommands).toEqual(['ls $f']);
  });

  test('a subshell is its inner commands, not a command of its own', () => {
    expect(splitCommand('(cd x && ls)').subcommands).toEqual(['cd x', 'ls']);
  });

  test('process substitution holds commands', () => {
    expect(denies('Bash(rm *)', 'diff <(rm x) b')).toBe(true);
  });

  test('a $ that opens no substitution is text', () => {
    expect(splitCommand('echo $HOME $1 $? ${HOME}').subcommands).toEqual([
      'echo $HOME $1 $? ${HOME}',
    ]);
  });
});

describe('the find actions beyond the four the docs name', () => {
  test.each([
    'find . -execdir rm {} +',
    'find . -ok rm {} \\;',
    'find . -okdir rm {} \\;',
    'find . -fprint0 out',
    'find . -fprintf out %p',
    'find . -fls out',
  ])('%j needs an exact rule', (command) => {
    expect(requiresPromptDespitePrefixRule(command)).toBe(true);
  });

  test('an option value that looks like an action only counts as a word of find', () => {
    expect(requiresPromptDespitePrefixRule('grep -e -delete file')).toBe(false);
    expect(requiresPromptDespitePrefixRule('ls watch')).toBe(false);
  });
});
