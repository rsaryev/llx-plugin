/**
 * skills.md § Pass arguments to skills: "Both you and Claude can pass arguments when invoking a
 * skill. Arguments are available via the `$ARGUMENTS` placeholder", the docs' `fix-issue` and
 * `migrate-component` skills, the `ARGUMENTS: <your input>` line when no placeholder receives one
 * ("A placeholder is `$ARGUMENTS`, an indexed form such as `$1`, or a named argument. An indexed
 * placeholder with no argument at its position stays as literal text and doesn't count as receiving
 * one. A named placeholder counts even when its position has no argument"). Each placeholder form
 * is proven on its own in substitute-arguments.test.ts.
 */
import { expect, test } from 'bun:test';
import { readSkillMentions } from '../../src/skills/mention.ts';
import { expandWith, skillFrom, textOf } from '../support/expand.ts';
import { spec } from '../support/spec.ts';

const FIX_ISSUE = `Fix GitHub issue $ARGUMENTS following our coding standards.

1. Read the issue description
2. Understand the requirements
3. Implement the fix
4. Write tests
5. Create a commit`;

const expanded = async (frontmatter: string, body: string, typed: string) =>
  textOf(
    (await expandWith(skillFrom(frontmatter, body), { request: { arguments: typed } })).expansion,
  );

spec('skills.behavior.Pass arguments to skills', () => {
  test('the user types them after the name: `/fix-issue 123` reaches Claude as "Fix GitHub issue 123 ..."', async () => {
    const [mention] = readSkillMentions('/fix-issue 123');
    expect(mention).toEqual({ how: 'direct', command: 'fix-issue', arguments: '123' });
    const text = await expanded('', FIX_ISSUE, mention?.how === 'direct' ? mention.arguments : '');
    expect(text.startsWith('Fix GitHub issue 123 following our coding standards.')).toBe(true);
    expect(text.includes('$ARGUMENTS')).toBe(false);
  });

  test('Claude passes them in the `args` of the Skill tool call: the same text, the same result', async () => {
    const input = { skill: 'fix-issue', args: '123' };
    const text = await expanded('', FIX_ISSUE, input.args);
    expect(text.startsWith('Fix GitHub issue 123 ')).toBe(true);
  });

  test('"Running /migrate-component SearchBar JavaScript TypeScript replaces $ARGUMENTS[0], [1] and [2]", and `$N` is the same', async () => {
    const indexed = 'Migrate the $ARGUMENTS[0] component from $ARGUMENTS[1] to $ARGUMENTS[2].';
    const short = 'Migrate the $0 component from $1 to $2.';
    const typed = 'SearchBar JavaScript TypeScript';
    const want = 'Migrate the SearchBar component from JavaScript to TypeScript.';
    expect(await expanded('', indexed, typed)).toBe(want);
    expect(await expanded('', short, typed)).toBe(want);
  });

  test('"If you invoke a skill with arguments but no placeholder receives one, Claude Code appends ARGUMENTS: <your input>"', async () => {
    const text = await expanded('', 'Deploy the app.', 'staging --fast');
    expect(text.startsWith('Deploy the app.')).toBe(true);
    expect(text.endsWith('ARGUMENTS: staging --fast')).toBe(true);
  });

  test('nothing is appended when no arguments were typed, or when a placeholder received them', async () => {
    expect(await expanded('', 'Deploy the app.', '')).toBe('Deploy the app.');
    expect(await expanded('', 'Deploy $ARGUMENTS.', 'staging')).toBe('Deploy staging.');
  });

  test('"An indexed placeholder with no argument at its position stays as literal text and doesn\'t count as receiving one": the line is appended', async () => {
    const text = await expanded('', 'Migrate $1 now.', 'only');
    expect(text.startsWith('Migrate $1 now.')).toBe(true);
    expect(text.endsWith('ARGUMENTS: only')).toBe(true);
  });

  test('"A named placeholder counts even when its position has no argument": it expands to nothing and no line is appended', async () => {
    const text = await expanded(
      'arguments: [target, mode]',
      'Ship to $target, mode: $mode.',
      'prod',
    );
    expect(text).toBe('Ship to prod, mode: .');
  });

  test('"Indexed arguments use shell-style quoting": a quoted value is one argument', async () => {
    expect(await expanded('', '$0|$1', '"hello world" second')).toBe('hello world|second');
  });
});
