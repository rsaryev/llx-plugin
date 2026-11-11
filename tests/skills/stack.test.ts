/**
 * skills.md § Stack several skills in one message: `/write-tests /fix-issue 123` loads both skills
 * and passes `123` as `$ARGUMENTS` to each; "the first skill plus up to five more"; "Expansion stops
 * at the first token that isn't an inline user-invocable skill"; a forked skill such as
 * `/code-review`, or one whose arguments may start with another command such as `/loop`, ends it and
 * "that token and everything after it become the argument text for every expanded skill"; through
 * the Agent SDK or `claude -p` only the first skill loads, with the rest of the line as arguments.
 */
import { describe, expect, test } from 'bun:test';
import { substituteArguments } from '../../src/skills/substitute.ts';
import type { Invocable } from '../../src/skills/invocation.ts';
import { skillLookup } from '../../src/skills/lookup.ts';
import { stackSkills, type StackOptions } from '../../src/skills/stack.ts';
import { skillWith } from '../support/skills.ts';
import { spec } from '../support/spec.ts';

const named = (name: string, frontmatter = '') =>
  skillWith(`name: ${name}\ndescription: ${name}\n${frontmatter}`, { name });

const WRITE_TESTS = named('write-tests');
const FIX_ISSUE = named('fix-issue');
const CODE_REVIEW = named('code-review', 'context: fork');
const LOOP = named('loop');
const CATALOG = [WRITE_TESTS, FIX_ISSUE, CODE_REVIEW, LOOP];
/** The stack over rows that answer to their command only, with the skills as given. */
function stackOf<T extends Invocable>(
  message: string,
  catalog: readonly T[],
  options: StackOptions = {},
) {
  const rows = catalog.map((invocable) => ({ invocable, names: [invocable.command] }));
  const stack = stackSkills(message, skillLookup(rows), options);
  return { ...stack, skills: stack.skills.map((row) => row.invocable) };
}
const commands = (message: string, options = {}) =>
  stackOf(message, CATALOG, options).skills.map((skill) => skill.command);

spec('skills.behavior.Stack several skills in one message', () => {
  test('the docs example: `/write-tests /fix-issue 123` expands both and gives each `123`', () => {
    const stack = stackOf('/write-tests /fix-issue 123', CATALOG);
    expect(stack.skills).toEqual([WRITE_TESTS, FIX_ISSUE]);
    expect(stack.arguments).toBe('123');
    for (const skill of stack.skills) {
      const text = substituteArguments(skill.body, {
        rawArguments: stack.arguments,
        names: skill.arguments,
      });
      expect(text.endsWith('ARGUMENTS: 123')).toBe(true);
    }
  });

  test('a stacked skill that forks ends the stack: it and everything after are argument text for every expanded skill', () => {
    const stack = stackOf('/write-tests /code-review /fix-issue 123', CATALOG);
    expect(stack.skills).toEqual([WRITE_TESTS]);
    expect(stack.arguments).toBe('/code-review /fix-issue 123');
  });

  test('a skill whose arguments may start with another command (/loop) ends the stack the same way', () => {
    const takesCommandArguments = new Set(['loop']);
    const stack = stackOf('/write-tests /loop 5m /fix-issue', CATALOG, {
      takesCommandArguments,
    });
    expect(stack.skills).toEqual([WRITE_TESTS]);
    expect(stack.arguments).toBe('/loop 5m /fix-issue');
  });

  test('a skill the user cannot invoke ends the stack: `user-invocable: false` and an `off` override', () => {
    const hidden = named('background', 'user-invocable: false');
    const catalog = [WRITE_TESTS, hidden, FIX_ISSUE];
    expect(stackOf('/write-tests /background /fix-issue', catalog).skills).toEqual([WRITE_TESTS]);
    expect(
      stackOf('/write-tests /fix-issue', catalog, { overrides: { 'fix-issue': 'off' } }).skills,
    ).toEqual([WRITE_TESTS]);
  });

  test('the first skill plus up to five more: the seventh is argument text', () => {
    const catalog = 'abcdefg'.split('').map((letter) => named(letter));
    const stack = stackOf('/a /b /c /d /e /f /g go', catalog);
    expect(stack.skills.map((skill) => skill.command)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(stack.arguments).toBe('/g go');
  });

  test('a first skill that forks runs alone, with the rest of the line as its arguments', () => {
    const stack = stackOf('/code-review /fix-issue 123', CATALOG);
    expect(stack.skills).toEqual([CODE_REVIEW]);
    expect(stack.arguments).toBe('/fix-issue 123');
  });

  test('"Through the Agent SDK or claude -p, Claude Code loads only the first skill, with the rest of the line as its arguments"', () => {
    const stack = stackOf('/write-tests /fix-issue 123', CATALOG, { interactive: false });
    expect(stack.skills).toEqual([WRITE_TESTS]);
    expect(stack.arguments).toBe('/fix-issue 123');
  });
});

describe('what a message that is no stack gives (judgments: spec/judgments.md)', () => {
  test('a message that does not start with the name of a skill of the session is no stack', () => {
    expect(commands('fix the build')).toEqual([]);
    expect(commands('/unknown 1')).toEqual([]);
    expect(commands('go ahead and /write-tests')).toEqual([]);
  });

  test('a name the session does not list ends the stack and is argument text', () => {
    const stack = stackOf('/write-tests /unknown /fix-issue', CATALOG);
    expect(stack.skills).toEqual([WRITE_TESTS]);
    expect(stack.arguments).toBe('/unknown /fix-issue');
  });

  test('a lone skill has no stack beyond itself', () => {
    const stack = stackOf('/fix-issue 12 and more', CATALOG);
    expect(stack.skills).toEqual([FIX_ISSUE]);
    expect(stack.arguments).toBe('12 and more');
  });
});

describe('every name of a row (judgments: spec/judgments.md)', () => {
  test('an alias and a directory-qualified name stack like the listed command', () => {
    const rows = [
      { invocable: WRITE_TESTS, names: ['write-tests', 'apps/web:write-tests'] },
      { invocable: FIX_ISSUE, names: ['fix-issue', 'fix'] },
    ];
    const stack = stackSkills('/apps/web:write-tests /fix 7', skillLookup(rows));
    expect(stack.skills.map((row) => row.invocable)).toEqual([WRITE_TESTS, FIX_ISSUE]);
    expect(stack.arguments).toBe('7');
    expect(stack.mentions.map((mention) => mention.command)).toEqual([
      'apps/web:write-tests',
      'fix',
    ]);
  });

  test('a listed command wins over an earlier row that has the same text as an alias', () => {
    const rows = [
      { invocable: WRITE_TESTS, names: ['write-tests', 'fix-issue'] },
      { invocable: FIX_ISSUE, names: ['fix-issue'] },
    ];
    expect(skillLookup(rows).find('fix-issue')?.invocable).toBe(FIX_ISSUE);
  });
});
