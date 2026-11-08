/**
 * hooks.md § PreToolUse input: "For the file tools `Write`, `Edit`, and `Read`, `tool_input.file_path`
 * is always absolute. Claude Code expands `~` and relative paths before hooks run, so a hook that
 * matches on paths can't be bypassed via `~` or a relative spelling of the same path. On Windows, the
 * path arrives with backslash separators". A `Write` call on Windows delivers
 * `"file_path": "C:\\project\\src\\index.ts"`.
 *
 * Where the docs are silent (how `..` folds, `~user`, a UNC path) the test sits outside spec() and
 * the choice is a row in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { expandToolInputPath, expandToolPath, matchRule } from '../../src/rules/index.ts';
import { call, matchContext, parsed } from '../support/rule-context.ts';
import { spec } from '../support/spec.ts';

const posix = { cwd: '/work/app', home: '/home/alice', platform: 'posix' } as const;
const windows = { cwd: 'C:\\project', home: 'C:\\Users\\alice', platform: 'windows' } as const;

const FILE_TOOL_IDS = [
  'tools.input.Read.file_path',
  'tools.input.Edit.file_path',
  'tools.input.Write.file_path',
] as const;

spec(FILE_TOOL_IDS, () => {
  test('~ and ~/path expand to the home directory', () => {
    expect(expandToolPath('~', posix)).toBe('/home/alice');
    expect(expandToolPath('~/notes/a.md', posix)).toBe('/home/alice/notes/a.md');
  });

  test('a relative path expands against the current directory', () => {
    expect(expandToolPath('src/index.ts', posix)).toBe('/work/app/src/index.ts');
    expect(expandToolPath('./src/index.ts', posix)).toBe('/work/app/src/index.ts');
    expect(expandToolPath('../other/a.ts', posix)).toBe('/work/other/a.ts');
  });

  test('an absolute path stays what it was', () => {
    expect(expandToolPath('/path/to/file.txt', posix)).toBe('/path/to/file.txt');
  });

  test('a call of Write, Edit and Read gets an absolute file_path, whatever else it carries', () => {
    for (const tool of ['Write', 'Edit', 'Read']) {
      const input = { file_path: '~/a.txt', content: 'x' };
      expect(expandToolInputPath(tool, input, posix)).toEqual({
        file_path: '/home/alice/a.txt',
        content: 'x',
      });
    }
  });

  test('a rule on a path cannot be bypassed by ~ or a relative spelling', () => {
    // Unexpanded, "~/.ssh/id_rsa" reads as a name below the current directory and misses the rule.
    const rule = parsed('Edit(~/.ssh/**)');
    for (const spelling of [
      '~/.ssh/id_rsa',
      '../../home/alice/.ssh/id_rsa',
      '/home/alice/.ssh/id_rsa',
    ]) {
      const input = expandToolInputPath('Edit', { file_path: spelling }, posix);
      expect([spelling, matchRule(rule, call('Edit', input), matchContext)]).toEqual([
        spelling,
        true,
      ]);
    }
  });

  test('on Windows the path arrives with backslash separators, from every spelling', () => {
    // The docs' own example.
    expect(expandToolPath('src/index.ts', windows)).toBe('C:\\project\\src\\index.ts');
    expect(expandToolPath('src\\index.ts', windows)).toBe('C:\\project\\src\\index.ts');
    expect(expandToolPath('C:/project/src/index.ts', windows)).toBe('C:\\project\\src\\index.ts');
    expect(expandToolPath('~\\notes\\a.md', windows)).toBe('C:\\Users\\alice\\notes\\a.md');
    expect(expandToolPath('~/notes/a.md', windows)).toBe('C:\\Users\\alice\\notes\\a.md');
  });

  test('the Windows Write example of the docs', () => {
    const delivered = expandToolInputPath(
      'Write',
      { file_path: 'src/index.ts', content: '...' },
      windows,
    );
    expect(delivered).toEqual({ file_path: 'C:\\project\\src\\index.ts', content: '...' });
  });
});

describe('expansion where the docs are silent (judgments, spec/judgments.md)', () => {
  test('only the three file tools are expanded: Glob and Grep keep their path as sent', () => {
    for (const tool of ['Glob', 'Grep', 'NotebookEdit', 'Bash']) {
      const input = { path: 'src', file_path: 'src/a.ts' };
      expect(expandToolInputPath(tool, input, posix)).toEqual(input);
    }
  });

  test('a call without a text file_path comes back as it was', () => {
    expect(expandToolInputPath('Read', { offset: 1 }, posix)).toEqual({ offset: 1 });
    expect(expandToolInputPath('Read', { file_path: 3 }, posix)).toEqual({ file_path: 3 });
    expect(expandToolInputPath('Read', 'nope', posix)).toEqual({});
  });

  test('. and .. fold, in an absolute path too, so a spelling with .. cannot hide the target', () => {
    expect(expandToolPath('/work/app/../../etc/passwd', posix)).toBe('/etc/passwd');
    expect(expandToolPath('../../../../..', posix)).toBe('/');
  });

  test('only ~ and ~/ are the home directory: ~alice is a folder of that name', () => {
    expect(expandToolPath('~alice/a.txt', posix)).toBe('/work/app/~alice/a.txt');
  });

  test('a Windows drive letter is upper case, and a UNC path keeps its two backslashes', () => {
    expect(expandToolPath('c:\\project\\a.txt', windows)).toBe('C:\\project\\a.txt');
    expect(expandToolPath('\\\\server\\share\\a.txt', windows)).toBe('\\\\server\\share\\a.txt');
  });

  test('the home directory "/" does not double the slash', () => {
    expect(expandToolPath('~/a.txt', { ...posix, home: '/' })).toBe('/a.txt');
  });
});
