/**
 * skills.md § Control who invokes a skill, "Where you write the skill's name": after plain text "The
 * name counts as your permission for that message: Claude can run the skill while it responds, and
 * judges from your wording whether you asked it to". The default matrix is in invocation.test.ts.
 */
import { describe, expect, test } from 'bun:test';
import { checkInvocation } from '../../src/skills/invocation.ts';
import type { SkillOverrides } from '../../src/skills/visibility.ts';
import { readSkillMentions } from '../../src/skills/mention.ts';
import { skillWith } from '../support/skills.ts';
import { spec } from '../support/spec.ts';

const DEPLOY = 'name: deploy\ndescription: Deploy the application to production\n';
const ABSENT = skillWith(DEPLOY);
const MANUAL_ONLY = skillWith(`${DEPLOY}disable-model-invocation: true`);
const named = { permittedByMention: true };
const overridden = (state: SkillOverrides[string]): SkillOverrides => ({ deploy: state });

/** What a host does with a message: the skill is named after plain text. */
const permittedBy = (message: string) =>
  readSkillMentions(message).some(
    (mention) => mention.how === 'named' && mention.command === 'deploy',
  );

const verdict = (message: string) =>
  checkInvocation(MANUAL_ONLY, 'model', {}, { permittedByMention: permittedBy(message) });

spec('skills.invocation.(default)', () => {
  test('"The name counts as your permission for that message": Claude may run a `disable-model-invocation` skill', () => {
    expect(checkInvocation(MANUAL_ONLY, 'model').allowed).toBe(false);
    expect(checkInvocation(MANUAL_ONLY, 'model', {}, named).allowed).toBe(true);
    expect(checkInvocation(MANUAL_ONLY, 'model', {}, { permittedByMention: false }).allowed).toBe(
      false,
    );
  });

  test('a message that names the skill grants it and one that only writes about it does not', () => {
    expect(verdict('go ahead and /deploy now').allowed).toBe(true);
    expect(verdict('go ahead and deploy now').allowed).toBe(false);
    expect(verdict('then /deploy, please').allowed).toBe(false);
  });
});

describe('the reach of a mention (judgments: spec/judgments.md)', () => {
  test('it lifts only `disable-model-invocation`: a `skillOverrides` state still hides the skill', () => {
    for (const state of ['user-invocable-only', 'off'] as const) {
      expect(checkInvocation(MANUAL_ONLY, 'model', overridden(state), named).allowed).toBe(false);
      expect(checkInvocation(ABSENT, 'model', overridden(state), named).allowed).toBe(false);
    }
  });

  test('it grants nothing to a preload, a scheduled fire or the user', () => {
    for (const by of ['preload', 'scheduled-task'] as const) {
      expect(checkInvocation(MANUAL_ONLY, by, {}, named).allowed).toBe(false);
    }
    const both = skillWith(`${DEPLOY}user-invocable: false\ndisable-model-invocation: true`);
    expect(checkInvocation(both, 'user', {}, named).allowed).toBe(false);
  });
});
