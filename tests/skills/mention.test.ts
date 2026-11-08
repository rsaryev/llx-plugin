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

describe('mentions (judgments: spec/judgments.md)', () => {
  test('a name alone is a direct run with no arguments', () => {
    expect(readSkillMentions('/deploy')).toEqual([
      { how: 'direct', command: 'deploy', arguments: '' },
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
