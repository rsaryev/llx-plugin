/**
 * skills.md § Control who invokes a skill: "By default, both you and Claude can invoke any skill",
 * the table of `disable-model-invocation: true` and `user-invocable: false`, and § Frontmatter
 * reference for the two fields. Also sub-agents.md § Preload skills into subagents ("You can't
 * preload skills that set `disable-model-invocation: true`"), scheduled-tasks.md § Run a prompt
 * repeatedly with /loop (a scheduled fire "only runs skills that Claude is allowed to invoke on its
 * own"), skills.md § Override skill visibility from settings and § Restrict Claude's skill access.
 */
import { describe, expect, test } from 'bun:test';
import { OVERRIDE_STATES, checkInvocation, invocationPolicy } from '../../src/skills/invocation.ts';
import { PLUGIN, skillWith } from '../support/skills.ts';
import { spec } from '../support/spec.ts';

/** The docs' deploy skill: "If you set `disable-model-invocation: true`, Claude can't run the skill automatically". */
const DEPLOY = 'name: deploy\ndescription: Deploy the application to production\n';

const ABSENT = skillWith(DEPLOY);
const MANUAL_ONLY = skillWith(`${DEPLOY}disable-model-invocation: true`);
const MODEL_ONLY = skillWith(`${DEPLOY}user-invocable: false`);

const allowedBy = (skill: ReturnType<typeof skillWith>) => ({
  user: checkInvocation(skill, 'user').allowed,
  model: checkInvocation(skill, 'model').allowed,
  preload: checkInvocation(skill, 'preload').allowed,
  'scheduled-task': checkInvocation(skill, 'scheduled-task').allowed,
});

spec('skills.invocation.(default)', () => {
  test('"By default, both you and Claude can invoke any skill"', () => {
    expect(allowedBy(ABSENT)).toEqual({
      user: true,
      model: true,
      preload: true,
      'scheduled-task': true,
    });
  });

  test('the table row: you Yes, Claude Yes, description always in context', () => {
    expect(invocationPolicy(ABSENT)).toMatchObject({
      user: true,
      model: true,
      listedToModel: 'description',
    });
  });

  test('the skill is in the `/` menu', () => {
    expect(invocationPolicy(ABSENT).inMenu).toBe(true);
  });

  test('is the same for a plugin skill and for a user skill', () => {
    for (const origin of [PLUGIN, { kind: 'user' } as const]) {
      expect(allowedBy(skillWith(DEPLOY, { origin }))).toEqual(allowedBy(ABSENT));
    }
  });
});

spec(
  [
    'skills.invocation.disable-model-invocation: true',
    'skills.frontmatter.disable-model-invocation',
  ],
  () => {
    test('the table row: you Yes, Claude "Not on its own"', () => {
      const policy = invocationPolicy(MANUAL_ONLY);
      expect(policy.user).toBe(true);
      expect(policy.model).toBe(false);
    });

    test('"Description not in context": the model is not told about the skill', () => {
      expect(invocationPolicy(MANUAL_ONLY).listedToModel).toBe('hidden');
    });

    test('the user still runs it with /name and sees it in the `/` menu', () => {
      expect(checkInvocation(MANUAL_ONLY, 'user').allowed).toBe(true);
      expect(invocationPolicy(MANUAL_ONLY).inMenu).toBe(true);
    });

    test('"If Claude tries anyway, Claude Code blocks the call" and Claude is told to have the user run /deploy', () => {
      const verdict = checkInvocation(MANUAL_ONLY, 'model');
      expect(verdict.allowed).toBe(false);
      if (verdict.allowed) throw new Error('unreachable');
      expect(verdict.reason).toBe('disable-model-invocation');
      // "instructs it not to reproduce the deploy steps another way, so expect Claude to suggest
      // running `/deploy` yourself"
      expect(verdict.message).toContain('/deploy');
    });

    test('"Also prevents the skill from being preloaded into subagents"', () => {
      expect(checkInvocation(MANUAL_ONLY, 'preload').allowed).toBe(false);
      expect(invocationPolicy(MANUAL_ONLY).preloadable).toBe(false);
    });

    test('"and from running when a session-scoped scheduled task fires with the skill as its prompt"', () => {
      expect(checkInvocation(MANUAL_ONLY, 'scheduled-task').allowed).toBe(false);
      expect(invocationPolicy(MANUAL_ONLY).scheduledPrompt).toBe(false);
    });

    test('the field takes `yes` and `on` in any letter case, like every boolean field', () => {
      for (const value of ['yes', 'ON', 'True', '1']) {
        const skill = skillWith(`${DEPLOY}disable-model-invocation: ${value}`);
        expect(checkInvocation(skill, 'model').allowed).toBe(false);
      }
      for (const value of ['false', 'off', 'No', '0']) {
        const skill = skillWith(`${DEPLOY}disable-model-invocation: ${value}`);
        expect(checkInvocation(skill, 'model').allowed).toBe(true);
      }
    });
  },
);

spec(['skills.invocation.user-invocable: false', 'skills.frontmatter.user-invocable'], () => {
  test('the table row: you No, Claude Yes, description always in context', () => {
    expect(invocationPolicy(MODEL_ONLY)).toMatchObject({
      user: false,
      model: true,
      listedToModel: 'description',
    });
  });

  test('"Claude Code hides it from the `/` menu and doesn\'t run it when you type `/name`"', () => {
    expect(invocationPolicy(MODEL_ONLY).inMenu).toBe(false);
    const verdict = checkInvocation(MODEL_ONLY, 'user');
    expect(verdict.allowed).toBe(false);
    if (verdict.allowed) throw new Error('unreachable');
    expect(verdict.reason).toBe('user-invocable-false');
  });

  test('Claude can still invoke it, and it can be preloaded and run by a scheduled task', () => {
    expect(checkInvocation(MODEL_ONLY, 'model').allowed).toBe(true);
    expect(checkInvocation(MODEL_ONLY, 'preload').allowed).toBe(true);
    expect(checkInvocation(MODEL_ONLY, 'scheduled-task').allowed).toBe(true);
  });

  test('"With `user-invocable: false`, you can\'t invoke the skill, but Claude still can": both flags hide it from everyone', () => {
    const both = skillWith(`${DEPLOY}user-invocable: false\ndisable-model-invocation: true`);
    expect(allowedBy(both)).toEqual({
      user: false,
      model: false,
      preload: false,
      'scheduled-task': false,
    });
    expect(invocationPolicy(both)).toMatchObject({ inMenu: false, listedToModel: 'hidden' });
  });
});

/**
 * `skillOverrides` is a setting, claimed by the settings stream; its effect on invocation is
 * documented (skills.md § Override skill visibility from settings) and proven here without
 * claiming the requirement.
 */
const overridden = (state: (typeof OVERRIDE_STATES)[number]) => ({ deploy: state });

describe('skillOverrides on invocation (skills.md § Override skill visibility from settings)', () => {
  test('the four states: who Claude sees and the `/` menu, exactly the docs table', () => {
    const expected = {
      on: { listedToModel: 'description', inMenu: true },
      'name-only': { listedToModel: 'name', inMenu: true },
      'user-invocable-only': { listedToModel: 'hidden', inMenu: true },
      off: { listedToModel: 'hidden', inMenu: false },
    } as const;
    for (const state of OVERRIDE_STATES) {
      expect(invocationPolicy(ABSENT, overridden(state))).toMatchObject(expected[state]);
    }
  });

  test('"A skill that is absent from `skillOverrides` is treated as `on`"', () => {
    expect(invocationPolicy(ABSENT, { other: 'off' })).toEqual(invocationPolicy(ABSENT));
  });

  test('"Plugin skills are not affected by `skillOverrides`"', () => {
    const plugin = skillWith(DEPLOY, { origin: PLUGIN });
    expect(invocationPolicy(plugin, overridden('off'))).toEqual(invocationPolicy(plugin));
  });

  test('a skill hidden from Claude by an override is not run by a scheduled fire or preloaded', () => {
    // scheduled-tasks.md: "Skills withheld from Claude by a `skillOverrides` setting ... reach
    // Claude as plain text instead of executing"
    for (const state of ['user-invocable-only', 'off'] as const) {
      expect(checkInvocation(ABSENT, 'scheduled-task', overridden(state)).allowed).toBe(false);
      expect(checkInvocation(ABSENT, 'model', overridden(state)).allowed).toBe(false);
    }
  });

  test('"user-invocable-only" keeps `/name`; "off" refuses it ("returns the skillOverrides error")', () => {
    expect(checkInvocation(ABSENT, 'user', overridden('user-invocable-only')).allowed).toBe(true);
    const verdict = checkInvocation(ABSENT, 'user', overridden('off'));
    expect(verdict.allowed).toBe(false);
    if (verdict.allowed) throw new Error('unreachable');
    expect(verdict.reason).toBe('skill-override');
    expect(verdict.message).toContain('skillOverrides');
  });

  test('the frontmatter still applies on top: `name-only` does not list a manual-only skill', () => {
    expect(invocationPolicy(MANUAL_ONLY, overridden('name-only')).listedToModel).toBe('hidden');
  });
});

describe('invocation verdicts (judgments: spec/judgments.md)', () => {
  test('a flag value the docs do not list leaves the default (a bad `user-invocable` stays invocable)', () => {
    expect(checkInvocation(skillWith(`${DEPLOY}user-invocable: banana`), 'user').allowed).toBe(
      true,
    );
  });

  test('every invoker has a verdict and the policy agrees with it', () => {
    for (const skill of [ABSENT, MANUAL_ONLY, MODEL_ONLY]) {
      const policy = invocationPolicy(skill);
      expect(checkInvocation(skill, 'user').allowed).toBe(policy.user);
      expect(checkInvocation(skill, 'model').allowed).toBe(policy.model);
      expect(checkInvocation(skill, 'preload').allowed).toBe(policy.preloadable);
      expect(checkInvocation(skill, 'scheduled-task').allowed).toBe(policy.scheduledPrompt);
    }
  });

  test('the refusal of the model asks for the user to run the skill and not to replace it', () => {
    const verdict = checkInvocation(MANUAL_ONLY, 'model');
    if (verdict.allowed) throw new Error('unreachable');
    expect(verdict.message).toMatch(/ask the user/i);
    expect(verdict.message).toMatch(/do not/i);
  });

  test('a plugin skill is addressed by its command, with the plugin prefix', () => {
    const verdict = checkInvocation(
      skillWith(`${DEPLOY}disable-model-invocation: true`, { origin: PLUGIN }),
      'model',
    );
    if (verdict.allowed) throw new Error('unreachable');
    expect(verdict.message).toContain('/my-plugin:deploy');
  });
});
