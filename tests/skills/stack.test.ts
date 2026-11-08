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
import { stackSkills } from '../../src/skills/stack.ts';
import { skillWith } from '../support/skills.ts';
import { spec } from '../support/spec.ts';

const named = (name: string, frontmatter = '') =>
  skillWith(`name: ${name}\ndescription: ${name}\n${frontmatter}`, { name });

const WRITE_TESTS = named('write-tests');
const FIX_ISSUE = named('fix-issue');
const CODE_REVIEW = named('code-review', 'context: fork');
const LOOP = named('loop');
const CATALOG = [WRITE_TESTS, FIX_ISSUE, CODE_REVIEW, LOOP];
const commands = (message: string, options = {}) =>
  stackSkills(message, CATALOG, options).skills.map((skill) => skill.command);

spec('skills.behavior.Stack several skills in one message', () => {
  test('the docs example: `/write-tests /fix-issue 123` expands both and gives each `123`', () => {
    const stack = stackSkills('/write-tests /fix-issue 123', CATALOG);
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
    const stack = stackSkills('/write-tests /code-review /fix-issue 123', CATALOG);
    expect(stack.skills).toEqual([WRITE_TESTS]);
    expect(stack.arguments).toBe('/code-review /fix-issue 123');
  });

  test('a skill whose arguments may start with another command (/loop) ends the stack the same way', () => {
    const takesCommandArguments = new Set(['loop']);
    const stack = stackSkills('/write-tests /loop 5m /fix-issue', CATALOG, {
      takesCommandArguments,
    });
    expect(stack.skills).toEqual([WRITE_TESTS]);
    expect(stack.arguments).toBe('/loop 5m /fix-issue');
  });

  test('a skill the user cannot invoke ends the stack: `user-invocable: false` and an `off` override', () => {
    const hidden = named('background', 'user-invocable: false');
    const catalog = [WRITE_TESTS, hidden, FIX_ISSUE];
    expect(stackSkills('/write-tests /background /fix-issue', catalog).skills).toEqual([
      WRITE_TESTS,
    ]);
    expect(
      stackSkills('/write-tests /fix-issue', catalog, { overrides: { 'fix-issue': 'off' } }).skills,
    ).toEqual([WRITE_TESTS]);
  });

  test('the first skill plus up to five more: the seventh is argument text', () => {
    const catalog = 'abcdefg'.split('').map((letter) => named(letter));
    const stack = stackSkills('/a /b /c /d /e /f /g go', catalog);
    expect(stack.skills.map((skill) => skill.command)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(stack.arguments).toBe('/g go');
  });

  test('a first skill that forks runs alone, with the rest of the line as its arguments', () => {
    const stack = stackSkills('/code-review /fix-issue 123', CATALOG);
    expect(stack.skills).toEqual([CODE_REVIEW]);
    expect(stack.arguments).toBe('/fix-issue 123');
  });

  test('"Through the Agent SDK or claude -p, Claude Code loads only the first skill, with the rest of the line as its arguments"', () => {
    const stack = stackSkills('/write-tests /fix-issue 123', CATALOG, { interactive: false });
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
    const stack = stackSkills('/write-tests /unknown /fix-issue', CATALOG);
    expect(stack.skills).toEqual([WRITE_TESTS]);
    expect(stack.arguments).toBe('/unknown /fix-issue');
  });

  test('a lone skill has no stack beyond itself', () => {
    const stack = stackSkills('/fix-issue 12 and more', CATALOG);
    expect(stack.skills).toEqual([FIX_ISSUE]);
    expect(stack.arguments).toBe('12 and more');
  });
});
