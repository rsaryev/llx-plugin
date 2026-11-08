/**
 * skills.md § Available string substitutions and § Pass arguments to skills: `$ARGUMENTS`,
 * `$ARGUMENTS[N]`, `$N` and `$name` expand to what the user typed after the skill's name; "an
 * indexed placeholder with no corresponding argument ... stays in the content unchanged"; "a
 * named placeholder ... with no matching argument expands to an empty string"; an argument value
 * "is inserted as literal text and isn't expanded"; `\$` escapes a placeholder; and when no
 * placeholder receives an argument Claude Code appends `ARGUMENTS: <value>`.
 */
import { describe, expect, test } from 'bun:test';
import { substituteArguments } from '../../src/skills/substitute.ts';
import { spec } from '../support/spec.ts';

const run = (content: string, rawArguments: string, names: readonly string[] = []) =>
  substituteArguments(content, { rawArguments, names });

/** `ARGUMENTS: <value>` closes the content; the separator before it is a judgment (below). */
const expectAppended = (result: string, base: string, value: string): void => {
  expect(result.startsWith(base)).toBe(true);
  expect(result.slice(base.length).trim()).toBe(`ARGUMENTS: ${value}`);
};

const FIX_ISSUE = `Fix GitHub issue $ARGUMENTS following our coding standards.

1. Read the issue description
2. Understand the requirements
3. Implement the fix
4. Write tests
5. Create a commit
`;

spec('skills.substitution.$ARGUMENTS', () => {
  test('the docs example: /fix-issue 123 reaches Claude as "Fix GitHub issue 123 ..."', () => {
    expect(run(FIX_ISSUE, '123').startsWith('Fix GitHub issue 123 following our coding')).toBe(
      true,
    );
    expect(run(FIX_ISSUE, '123')).not.toContain('ARGUMENTS');
  });

  test('is the full argument string as typed, quotes and spacing included', () => {
    expect(run('Args: $ARGUMENTS', '"hello world"  second')).toBe('Args: "hello world"  second');
  });

  test('with no arguments typed the placeholder is the empty string', () => {
    expect(run('Fix issue $ARGUMENTS.', '')).toBe('Fix issue .');
  });

  test('every occurrence is replaced', () => {
    expect(run('$ARGUMENTS and again $ARGUMENTS', 'x')).toBe('x and again x');
  });

  test('appends "ARGUMENTS: <value>" to the end when no placeholder received an argument', () => {
    const result = run('Summarize the changes.', 'the staged ones');
    expect(result.startsWith('Summarize the changes.')).toBe(true);
    expect(result.endsWith('ARGUMENTS: the staged ones')).toBe(true);
  });

  test('appends nothing when no argument was given', () => {
    expect(run('Summarize the changes.', '')).toBe('Summarize the changes.');
    expect(run('Summarize the changes.', '  \n')).toBe('Summarize the changes.');
  });

  test('a placeholder that received the arguments suppresses the append', () => {
    expect(run('Fix $ARGUMENTS now', '7')).toBe('Fix 7 now');
  });

  test('a value that holds placeholders is inserted as literal text, the docs example', () => {
    expect(run('Summarize $0', '"$ARGUMENTS from yesterday"')).toBe(
      'Summarize $ARGUMENTS from yesterday',
    );
    expect(run('Say $ARGUMENTS and $0', '$1 $0')).toBe('Say $1 $0 and $1');
  });

  test('a backslash escapes it ("\\$ARGUMENTS" is the text), which then counts as unreceived', () => {
    const result = run('Write \\$ARGUMENTS literally', 'x');
    expect(result.startsWith('Write $ARGUMENTS literally')).toBe(true);
    expect(result.endsWith('ARGUMENTS: x')).toBe(true);
  });

  test('is not an unrelated longer variable name', () => {
    expectAppended(
      run('keep $ARGUMENTS_FILE and $ARGUMENTSX', 'x'),
      'keep $ARGUMENTS_FILE and $ARGUMENTSX',
      'x',
    );
  });
});

spec('skills.substitution.$ARGUMENTS[N]', () => {
  const MIGRATE = `Migrate the $ARGUMENTS[0] component from $ARGUMENTS[1] to $ARGUMENTS[2].
Preserve all existing behavior and tests.
`;

  test('the docs example: /migrate-component SearchBar JavaScript TypeScript', () => {
    expect(run(MIGRATE, 'SearchBar JavaScript TypeScript')).toBe(
      `Migrate the SearchBar component from JavaScript to TypeScript.
Preserve all existing behavior and tests.
`,
    );
  });

  test('is 0-based: [0] is the first argument', () => {
    expect(run('$ARGUMENTS[0]|$ARGUMENTS[1]', 'a b')).toBe('a|b');
  });

  test('indexed arguments use shell-style quoting', () => {
    expect(run('$ARGUMENTS[0]|$ARGUMENTS[1]', '"hello world" second')).toBe('hello world|second');
  });

  test('an index with no argument stays in the content unchanged and receives nothing', () => {
    expectAppended(run('Use $ARGUMENTS[2] here', 'only one'), 'Use $ARGUMENTS[2] here', 'only one');
    expect(run('Use $ARGUMENTS[0] and $ARGUMENTS[3]', 'one')).toBe('Use one and $ARGUMENTS[3]');
  });

  test('a bracket that is not an index leaves "$ARGUMENTS" the whole string', () => {
    expect(run('$ARGUMENTS[x] $ARGUMENTS[] $ARGUMENTS[-1]', 'a b')).toBe('a b[x] a b[] a b[-1]');
  });

  test('a backslash before it escapes the whole indexed form', () => {
    expect(run('literal \\$ARGUMENTS[0] and $ARGUMENTS[0]', 'a')).toBe(
      'literal $ARGUMENTS[0] and a',
    );
  });
});

spec('skills.substitution.$N', () => {
  const MIGRATE = `Migrate the $0 component from $1 to $2.
Preserve all existing behavior and tests.
`;

  test('the docs example, the shorthand of $ARGUMENTS[N]', () => {
    expect(run(MIGRATE, 'SearchBar JavaScript TypeScript')).toBe(
      `Migrate the SearchBar component from JavaScript to TypeScript.
Preserve all existing behavior and tests.
`,
    );
  });

  test('"hello world" second makes $0 "hello world" and $1 "second", the docs example', () => {
    expect(run('[$0] [$1]', '"hello world" second')).toBe('[hello world] [second]');
  });

  test('$2 with one argument stays unchanged and does not count as received', () => {
    expectAppended(run('Got $2', 'one'), 'Got $2', 'one');
    expect(run('Got $0 and $2', 'one')).toBe('Got one and $2');
  });

  test('takes every digit that follows, so $10 is the eleventh argument', () => {
    expect(run('$1|$10', 'a b c d e f g h i j k')).toBe('b|k');
  });

  test('escapes with one backslash: \\$1.00 is "$1.00", unreceived', () => {
    expectAppended(run('Costs \\$1.00', 'x'), 'Costs $1.00', 'x');
    expect(run('Costs \\$1.00 for $0', 'x')).toBe('Costs $1.00 for x');
  });

  test('a doubled backslash does not escape: both stay and $1 still expands', () => {
    expect(run('\\\\$1', 'a b')).toBe('\\\\b');
    expect(run('\\\\\\$1', 'a b')).toBe('\\\\\\b');
  });

  test('a backslash before any other $ is left unchanged', () => {
    expect(run('\\$HOME \\$x \\$ \\$(cmd) $0', 'a')).toBe('\\$HOME \\$x \\$ \\$(cmd) a');
  });

  test('a $ that no digit follows is plain text', () => {
    expectAppended(run('cost: $ 5 and $$ and $x', 'a'), 'cost: $ 5 and $$ and $x', 'a');
  });
});

spec('skills.substitution.$name', () => {
  const NAMES = ['issue', 'branch'];

  test('names map to positions in order: $issue is the first argument, $branch the second', () => {
    expect(run('Fix $issue on $branch', '123 main', NAMES)).toBe('Fix 123 on main');
  });

  test('a named placeholder with no argument is the empty string', () => {
    expect(run('Fix $issue on [$branch]', '123', NAMES)).toBe('Fix 123 on []');
  });

  test('a named placeholder counts as received even when its position has no argument', () => {
    expect(run('Fix [$issue]', '', NAMES)).toBe('Fix []');
    expect(run('Only [$branch] here', 'one', NAMES)).toBe('Only [] here');
  });

  test('uses the shell-style quoting of the indexed forms', () => {
    expect(run('$issue|$branch', '"two words" main', NAMES)).toBe('two words|main');
  });

  test('a name that was not declared is plain text', () => {
    expect(run('$issue $other', '1', NAMES)).toBe('1 $other');
  });

  test('is a whole name: $issues is not $issue followed by s', () => {
    expect(run('$issues $issue', '1', NAMES)).toBe('$issues 1');
  });

  test('a backslash escapes a declared name, and it is then unreceived', () => {
    expectAppended(run('keep \\$issue', '1', NAMES), 'keep $issue', '1');
    expectAppended(run('keep \\$other', '1', NAMES), 'keep \\$other', '1');
  });

  test('named and indexed forms read the same arguments', () => {
    expect(run('$issue = $0 = $ARGUMENTS[0]', '42', NAMES)).toBe('42 = 42 = 42');
  });

  test('a name written with a dash is read whole', () => {
    expect(run('$pr-number and $pr', '9 8', ['pr-number', 'pr'])).toBe('9 and 8');
  });
});

describe('placeholders outside the documented forms (judgments)', () => {
  test('the appended line follows a blank line and carries the arguments as typed', () => {
    expect(run('Do it.', '  a  b ')).toBe('Do it.\n\nARGUMENTS:   a  b ');
  });

  test('a name is not read as the start of a longer identifier, an index takes every digit', () => {
    expect(run('$a1 $a_b $1a', 'x y', ['a'])).toBe('$a1 $a_b ya');
  });

  test('one pass: a value that looks like a later placeholder is not expanded', () => {
    expect(run('$0 $1', '$1 x')).toBe('$1 x');
  });

  test('a duplicate name keeps its first position', () => {
    expect(run('$a', 'x y', ['a', 'a'])).toBe('x');
  });

  test('a huge index stays literal rather than reading a wrong argument', () => {
    expect(run('$99999999999999999999 $0', 'a')).toBe('$99999999999999999999 a');
  });
});
