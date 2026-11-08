/**
 * skills.md § Available string substitutions: "Indexed arguments use shell-style quoting, so wrap
 * multi-word values in quotes. For example, `/my-skill "hello world" second` makes `$0` expand to
 * `hello world` and `$1` to `second`." The quoting rules beyond that example are the kit's
 * judgment (spec/judgments.md), so these tests sit outside spec(...): the requirement ids of the
 * placeholders are proven in substitute-arguments.test.ts, which reads arguments through here.
 */
import { describe, expect, test } from 'bun:test';
import { parseArguments } from '../../src/skills/arguments.ts';

describe('parseArguments', () => {
  test('the docs example: a quoted value is one argument', () => {
    expect(parseArguments('"hello world" second')).toEqual(['hello world', 'second']);
  });

  test('plain words split on any run of whitespace, and nothing gives no argument', () => {
    expect(parseArguments('SearchBar   JavaScript\tTypeScript\n')).toEqual([
      'SearchBar',
      'JavaScript',
      'TypeScript',
    ]);
    expect(parseArguments('')).toEqual([]);
    expect(parseArguments('   \n ')).toEqual([]);
  });

  test('single quotes keep everything literal, double quotes take a backslash before " and \\', () => {
    expect(parseArguments(`'a "b" $1' "c \\"d\\" e\\\\f"`)).toEqual(['a "b" $1', 'c "d" e\\f']);
  });

  test('quoted and bare parts of one word join, as in a shell', () => {
    expect(parseArguments('pre"fix and"suf')).toEqual(['prefix andsuf']);
    expect(parseArguments(`--title="two words"`)).toEqual(['--title=two words']);
  });

  test('an empty pair of quotes is an empty argument', () => {
    expect(parseArguments(`a "" b`)).toEqual(['a', '', 'b']);
  });

  test('a backslash escapes a space, a quote or a backslash, and is kept before anything else', () => {
    expect(parseArguments('one\\ two \\"x\\" a\\\\b')).toEqual(['one two', '"x"', 'a\\b']);
    expect(parseArguments('C:\\Users\\me\\file.txt')).toEqual(['C:\\Users\\me\\file.txt']);
  });

  test('a quote that is never closed takes the rest of the text as part of one argument', () => {
    expect(parseArguments('first "second third')).toEqual(['first', 'second third']);
    expect(parseArguments(`first 'second  third`)).toEqual(['first', 'second  third']);
    expect(parseArguments('a "b\\')).toEqual(['a', 'b\\']);
  });

  test('a trailing backslash outside quotes is kept', () => {
    expect(parseArguments('path\\')).toEqual(['path\\']);
  });
});
