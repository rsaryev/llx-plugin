/**
 * permissions.md § What `Read` and `Edit` rules cover ("Read and Edit deny rules apply to Claude's
 * built-in file tools, to file commands Claude Code recognizes in Bash, such as `cat`, `head`, `tail`,
 * `sed`, and `tee`, and to the targets of Bash redirections such as `> file` and `< file`. They don't
 * apply to a command that reads files without naming them") and § Redirections (`/dev/null` and
 * descriptor forms name no file). The commands beyond the five the docs name are a judgment
 * (spec/judgments.md, `src/rules/decide/file-targets.ts`).
 */
import { describe, expect, test } from 'bun:test';
import { bashFileTargets } from '../../src/rules/index.ts';
import { matchContext } from '../support/rule-context.ts';
import { spec } from '../support/spec.ts';

const targets = (command: string) => bashFileTargets(command, matchContext.paths);

spec(['permissions.behavior.What Read and Edit rules cover'], () => {
  test('cat, head and tail read their operands, resolved against the working directory', () => {
    expect(targets('cat a.txt ~/b.txt /etc/c')).toEqual({
      reads: ['/work/app/a.txt', '/home/alice/b.txt', '/etc/c'],
      writes: [],
    });
    expect(targets('head a && tail -f b').reads).toEqual(['/work/app/a', '/work/app/b']);
  });

  test('sed reads its files, and writes them with -i; its first operand is the script', () => {
    expect(targets("sed 's/a/b/' f")).toEqual({ reads: ['/work/app/f'], writes: [] });
    expect(targets("sed -i 's/a/b/' f")).toEqual({ reads: [], writes: ['/work/app/f'] });
  });

  test('tee writes its files, once', () => {
    expect(targets('echo x | tee out.log')).toEqual({ reads: [], writes: ['/work/app/out.log'] });
  });

  test('a command that reads files without naming them names none', () => {
    expect(targets('python script.py')).toEqual({ reads: [], writes: [] });
    expect(targets('ls')).toEqual({ reads: [], writes: [] });
  });

  test('a wrapper in front of the command is looked through', () => {
    expect(targets('timeout 5 cat a').reads).toEqual(['/work/app/a']);
  });
});

spec(['permissions.behavior.Redirections'], () => {
  test('> and >> write their target, < reads it', () => {
    expect(targets('make > out && cat x >> log < in')).toEqual({
      reads: ['/work/app/in', '/work/app/x'],
      writes: ['/work/app/out', '/work/app/log'],
    });
  });

  test('a redirect target is not read as an operand', () => {
    expect(targets('cat a > b').reads).toEqual(['/work/app/a']);
    expect(targets('cat a 2> err').writes).toEqual(['/work/app/err']);
  });

  test('/dev/null and descriptor forms name no file', () => {
    expect(targets('make > /dev/null 2>&1')).toEqual({ reads: [], writes: [] });
  });
});

describe('judgments about the file commands', () => {
  test('grep and jq take a pattern or a program first, then files', () => {
    expect(targets('grep -rn needle src').reads).toEqual(['/work/app/src']);
    expect(targets('jq .a data.json').reads).toEqual(['/work/app/data.json']);
  });

  test('cp and mv read all but the last operand and write the last', () => {
    expect(targets('cp a b c/')).toEqual({
      reads: ['/work/app/a', '/work/app/b'],
      writes: ['/work/app/c'],
    });
    expect(targets('mv only')).toEqual({ reads: [], writes: [] });
  });

  test('rm, touch and mkdir write their operands', () => {
    expect(targets('rm -rf build').writes).toEqual(['/work/app/build']);
  });
});
