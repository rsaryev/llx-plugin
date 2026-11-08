/**
 * skills.md § Override skill visibility from settings: the `skillOverrides` setting, "Each key is a
 * skill name and each value is one of four states", the table of what Claude is told and what the
 * `/` menu lists, "`off` also hides the skill from the command lists advertised to Remote Control
 * clients and to Agent SDK callers", "Invoking a hidden skill by its full name returns the
 * `skillOverrides` error", "A skill that is absent from `skillOverrides` is treated as `on`", and
 * the plugin exemption of the same section.
 */
import { describe, expect, test } from 'bun:test';
import { checkInvocation, invocationPolicy } from '../../src/skills/invocation.ts';
import { menuEntries, modelListing } from '../../src/skills/listing.ts';
import {
  OVERRIDE_EXPOSURE,
  OVERRIDE_STATES,
  overrideMenuLabel,
  overrideState,
} from '../../src/skills/visibility.ts';
import { PLUGIN, skillWith } from '../support/skills.ts';
import { spec } from '../support/spec.ts';

const ON = 'skills.behavior.Override skill visibility from settings."on"';
const NAME_ONLY = 'skills.behavior.Override skill visibility from settings."name-only"';
const USER_ONLY = 'skills.behavior.Override skill visibility from settings."user-invocable-only"';
const OFF = 'skills.behavior.Override skill visibility from settings."off"';

const skillNamed = (name: string, frontmatter = '') =>
  skillWith(`name: ${name}\ndescription: Does ${name}\n${frontmatter}`, { name });

/** The docs' example: `legacy-context` collapsed to its name, `deploy` turned off. */
const LEGACY = skillNamed('legacy-context');
const DEPLOY = skillNamed('deploy');
const OTHER = skillNamed('other');

const told = (overrides: Parameters<typeof modelListing>[1]) =>
  modelListing([LEGACY, DEPLOY, OTHER], overrides).entries;
const menu = (overrides: Record<string, (typeof OVERRIDE_STATES)[number]>) =>
  menuEntries([LEGACY, DEPLOY, OTHER], { overrides }).map((row) => row.name);

spec(ON, () => {
  test('"Listed to Claude: Name and description", "In / menu: Yes"', () => {
    const overrides = { deploy: 'on' } as const;
    expect(told({ overrides }).find((entry) => entry.name === 'deploy')).toEqual({
      name: 'deploy',
      description: 'Does deploy',
    });
    expect(menu(overrides)).toContain('deploy');
  });

  test('"A skill that is absent from skillOverrides is treated as on"', () => {
    expect(overrideState(DEPLOY, {})).toBe('on');
    expect(overrideState(DEPLOY, { other: 'off' })).toBe('on');
    expect(invocationPolicy(DEPLOY, { other: 'off' })).toEqual(invocationPolicy(DEPLOY));
    expect(told({ overrides: { other: 'off' } }).map((entry) => entry.name)).toEqual([
      'legacy-context',
      'deploy',
    ]);
  });

  test('a skill the user may run and Claude may run is invocable by both', () => {
    const overrides = { deploy: 'on' } as const;
    expect(checkInvocation(DEPLOY, 'user', overrides).allowed).toBe(true);
    expect(checkInvocation(DEPLOY, 'model', overrides).allowed).toBe(true);
  });
});

spec(NAME_ONLY, () => {
  const overrides = { 'legacy-context': 'name-only' } as const;

  test('"Listed to Claude: Name only": the entry carries no description', () => {
    expect(told({ overrides }).find((entry) => entry.name === 'legacy-context')).toEqual({
      name: 'legacy-context',
    });
  });

  test('the docs example: one skill collapsed to its name, the others untouched', () => {
    const example = { 'legacy-context': 'name-only', deploy: 'off' } as const;
    expect(told({ overrides: example })).toEqual([
      { name: 'legacy-context' },
      { name: 'other', description: 'Does other' },
    ]);
  });

  test('"In / menu: Yes", with its description, and the user and Claude can still run it', () => {
    expect(menu(overrides)).toContain('legacy-context');
    expect(menuEntries([LEGACY], { overrides })[0]?.description).toBe('Does legacy-context');
    expect(checkInvocation(LEGACY, 'user', overrides).allowed).toBe(true);
    expect(checkInvocation(LEGACY, 'model', overrides).allowed).toBe(true);
  });

  test('the frontmatter still wins: a manual-only skill stays hidden from Claude', () => {
    const manual = skillNamed('legacy-context', 'disable-model-invocation: true');
    expect(modelListing([manual], { overrides }).entries).toEqual([]);
  });
});

spec(USER_ONLY, () => {
  const overrides = { deploy: 'user-invocable-only' } as const;

  test('"Listed to Claude: Hidden": the listing does not mention the skill', () => {
    expect(told({ overrides }).map((entry) => entry.name)).toEqual(['legacy-context', 'other']);
  });

  test('"In / menu: Yes": the user still sees and runs it', () => {
    expect(menu(overrides)).toContain('deploy');
    expect(checkInvocation(DEPLOY, 'user', overrides).allowed).toBe(true);
  });

  test('Claude cannot invoke it, a subagent cannot preload it and a scheduled fire does not run it', () => {
    for (const by of ['model', 'preload', 'scheduled-task'] as const) {
      const verdict = checkInvocation(DEPLOY, by, overrides);
      expect([by, verdict.allowed]).toEqual([by, false]);
    }
  });

  test('"The /skills menu labels the user-invocable-only state user-only"', () => {
    expect(overrideMenuLabel('user-invocable-only')).toBe('user-only');
    expect(overrideMenuLabel('on')).toBe('on');
    expect(overrideMenuLabel('name-only')).toBe('name-only');
    expect(overrideMenuLabel('off')).toBe('off');
  });
});

spec(OFF, () => {
  const overrides = { deploy: 'off' } as const;

  test('"Listed to Claude: Hidden" and "In / menu: Hidden"', () => {
    expect(told({ overrides }).map((entry) => entry.name)).not.toContain('deploy');
    expect(menu(overrides)).not.toContain('deploy');
  });

  test('"also hides the skill from the command lists advertised to Remote Control clients and to Agent SDK callers": judgment: those lists are the menu rows', () => {
    // the SDK's `SlashCommand` rows are what `menuEntries` returns: an off skill has none
    const rows = menuEntries([LEGACY, DEPLOY, OTHER], { overrides });
    expect(rows.map((row) => row.name)).toEqual(['legacy-context', 'other']);
  });

  test('"Invoking a hidden skill by its full name returns the skillOverrides error instead of running it"', () => {
    for (const by of ['user', 'model'] as const) {
      const verdict = checkInvocation(DEPLOY, by, overrides);
      expect(verdict.allowed).toBe(false);
      if (verdict.allowed) throw new Error('unreachable');
      expect(verdict.reason).toBe('skill-override');
      expect(verdict.message).toContain('skillOverrides');
    }
  });

  test('an override of another name leaves the skill alone', () => {
    expect(checkInvocation(OTHER, 'user', overrides).allowed).toBe(true);
  });
});

describe('the four states as one registry (skills.md § Override skill visibility from settings)', () => {
  test('every state has one row, in the order of the docs table', () => {
    expect(OVERRIDE_STATES).toEqual(['on', 'name-only', 'user-invocable-only', 'off']);
    expect(Object.keys(OVERRIDE_EXPOSURE)).toEqual([...OVERRIDE_STATES]);
  });

  test('"Plugin skills are not affected by skillOverrides"', () => {
    const plugin = skillWith('name: deploy\ndescription: D', { origin: PLUGIN });
    for (const state of OVERRIDE_STATES) {
      expect(overrideState(plugin, { deploy: state })).toBe('on');
    }
  });

  test('a name that is only an inherited property is not an override', () => {
    expect(overrideState(skillNamed('constructor'), {})).toBe('on');
  });
});
