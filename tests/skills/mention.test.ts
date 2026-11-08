/**
 * skills.md § Control who invokes a skill, "Where you write the skill's name": a name at the start
 * of the message runs the skill directly (`/deploy staging`); after plain text, "as a separate word
 * with no punctuation attached" (`go ahead and /deploy to staging`), nothing runs directly and the
 * name counts as the user's permission for that message.
 */
import { describe, expect, test } from 'bun:test';
import { readSkillMentions } from '../../src/skills/mention.ts';
import { spec } from '../support/spec.ts';

spec('skills.invocation.(default)', () => {
  test('the docs row: `/deploy staging` at the start runs the skill directly, with the rest as arguments', () => {
    expect(readSkillMentions('/deploy staging')).toEqual([
      { how: 'direct', command: 'deploy', arguments: 'staging' },
    ]);
  });

  test('the docs row: after plain text the name runs nothing directly and names a permission', () => {
    expect(readSkillMentions('go ahead and /deploy to staging')).toEqual([
      { how: 'named', command: 'deploy' },
    ]);
  });

  test('"To write about the skill without permitting a run, leave off the slash"', () => {
    expect(readSkillMentions('go ahead and deploy to staging')).toEqual([]);
  });

  test('punctuation attached to the name is not a mention', () => {
    for (const text of ['then /deploy, please', 'ran /deploy.', '(/deploy)', 'see "/deploy"']) {
      expect(readSkillMentions(text)).toEqual([]);
    }
  });

  test('a word that merely contains a slash is not a mention (a path, a URL)', () => {
    expect(readSkillMentions('read src/deploy and /usr/bin/env')).toEqual([]);
    expect(readSkillMentions('see https://example.com/deploy now')).toEqual([]);
  });

  test('a plugin skill is named with its prefix', () => {
    expect(readSkillMentions('/my-plugin:review the diff')).toEqual([
      { how: 'direct', command: 'my-plugin:review', arguments: 'the diff' },
    ]);
  });
});

/**
 * skills.md § Stack several skills in one message: at the terminal prompt `/write-tests /fix-issue
 * 123` "loads both skills and passes the trailing text `123` as `$ARGUMENTS` to each of them"; "the
 * first skill plus up to five more"; "Expansion stops at the first token that isn't an inline
 * user-invocable skill ... That token and everything after it become the argument text for every
 * expanded skill"; through `claude -p` "Claude Code loads only the first skill, with the rest of the
 * line as its arguments". The page has no requirement id of its own.
 */
const NOT_INLINE = new Set(['code-review', 'loop']);
const stackable = (command: string) => !NOT_INLINE.has(command);

describe('stacked skills (skills.md § Stack several skills in one message)', () => {
  test('`/write-tests /fix-issue 123` loads both skills, each with the trailing `123`', () => {
    expect(readSkillMentions('/write-tests /fix-issue 123')).toEqual([
      { how: 'direct', command: 'write-tests', arguments: '123' },
      { how: 'stacked', command: 'fix-issue', arguments: '123' },
    ]);
  });

  test('the first skill plus up to five more are expanded: the seventh name is argument text', () => {
    const mentions = readSkillMentions('/a /b /c /d /e /f /g 1');
    expect(mentions.filter((mention) => mention.how !== 'named')).toHaveLength(6);
    expect(mentions[0]).toEqual({ how: 'direct', command: 'a', arguments: '/g 1' });
    expect(mentions.slice(1, 6).map((mention) => mention.how)).toEqual(Array(5).fill('stacked'));
    expect(mentions.at(-1)).toEqual({ how: 'named', command: 'g' });
  });

  test('expansion stops at the first token that is not an inline user-invocable skill (the host says which)', () => {
    expect(readSkillMentions('/write-tests /code-review /fix-issue 123', { stackable })).toEqual([
      { how: 'direct', command: 'write-tests', arguments: '/code-review /fix-issue 123' },
      { how: 'named', command: 'code-review' },
      { how: 'named', command: 'fix-issue' },
    ]);
    expect(readSkillMentions('/a /b /loop 5m /c', { stackable })).toEqual([
      { how: 'direct', command: 'a', arguments: '/loop 5m /c' },
      { how: 'stacked', command: 'b', arguments: '/loop 5m /c' },
      { how: 'named', command: 'loop' },
      { how: 'named', command: 'c' },
    ]);
  });

  test('a token that is not a name (plain text, `/usr/bin`) ends the stack', () => {
    expect(readSkillMentions('/a /b then /c')).toEqual([
      { how: 'direct', command: 'a', arguments: 'then /c' },
      { how: 'stacked', command: 'b', arguments: 'then /c' },
      { how: 'named', command: 'c' },
    ]);
    expect(readSkillMentions('/a /usr/bin')[0]).toEqual({
      how: 'direct',
      command: 'a',
      arguments: '/usr/bin',
    });
  });

  test('through `-p` or the Agent SDK only the first skill loads, the rest of the line is its arguments', () => {
    expect(readSkillMentions('/write-tests /fix-issue 123', { interactive: false })).toEqual([
      { how: 'direct', command: 'write-tests', arguments: '/fix-issue 123' },
      { how: 'named', command: 'fix-issue' },
    ]);
  });
});

describe('mentions (judgments: spec/judgments.md)', () => {
  test('a name alone is a direct run with no arguments', () => {
    expect(readSkillMentions('/deploy')).toEqual([
      { how: 'direct', command: 'deploy', arguments: '' },
    ]);
  });

  test('a first skill the host does not call stackable runs alone with the rest as arguments', () => {
    expect(readSkillMentions('/code-review /fix-issue', { stackable: () => false })).toEqual([
      { how: 'direct', command: 'code-review', arguments: '/fix-issue' },
      { how: 'named', command: 'fix-issue' },
    ]);
  });

  test('a start-of-message name followed by another mention reports both, the first direct', () => {
    expect(readSkillMentions('/write-tests then /fix-issue 123')).toEqual([
      { how: 'direct', command: 'write-tests', arguments: 'then /fix-issue 123' },
      { how: 'named', command: 'fix-issue' },
    ]);
  });

  test('a message that starts with plain text and holds the name twice reports it once', () => {
    expect(readSkillMentions('use /deploy and /deploy')).toEqual([
      { how: 'named', command: 'deploy' },
    ]);
  });

  test('leading whitespace before the first name does not stop a direct run', () => {
    expect(readSkillMentions('  /deploy staging')[0]?.how).toBe('direct');
  });

  test('a bare slash and a slash-only word are not names', () => {
    expect(readSkillMentions('/ and //')).toEqual([]);
  });
});
