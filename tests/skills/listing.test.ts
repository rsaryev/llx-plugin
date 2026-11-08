/**
 * skills.md § Frontmatter reference (`description`, `when_to_use`, `argument-hint`), § Skill
 * descriptions are cut short (the budget: 1% of the context window, drops "starting with the skills
 * you invoke least", names always listed, `SLASH_COMMAND_TOOL_CHAR_BUDGET`), § Angle brackets in a
 * skill description, § Override skill visibility from settings (the four states and the plugin
 * exemption), settings-reference.md § `skillListingMaxDescChars` and `skillListingBudgetFraction`.
 */
import { describe, expect, test } from 'bun:test';
import { listingLine, menuEntries, modelListing } from '../../src/skills/listing.ts';
import { PLUGIN, skillWith } from '../support/skills.ts';
import { spec } from '../support/spec.ts';

const named = (name: string, frontmatter = '', body?: string) =>
  skillWith(`name: ${name}\n${frontmatter}`, { name, ...(body === undefined ? {} : { body }) });
const described = (name: string, description: string, extra = '') =>
  named(name, `description: ${JSON.stringify(description)}\n${extra}`);
const listed = (
  skills: Parameters<typeof modelListing>[0],
  options?: Parameters<typeof modelListing>[1],
) => modelListing(skills, options).entries;

spec('skills.frontmatter.description', () => {
  test('the listing carries the description with the name', () => {
    expect(listed([described('commit', 'Stage and commit the current changes')])).toEqual([
      { name: 'commit', description: 'Stage and commit the current changes' },
    ]);
  });

  test('"If omitted, uses the first non-empty line of the markdown content"', () => {
    const skill = named('notes', '', '\n\nTake notes about the session.\n\nMore.');
    expect(listed([skill])[0]?.description).toBe('Take notes about the session.');
  });

  test('"the combined `description` and `when_to_use` text is truncated at 1,536 characters in the skill listing"', () => {
    const exact = 'a'.repeat(1536);
    expect(listed([described('a', exact)])[0]?.description).toBe(exact);
    expect(listed([described('a', `${exact}b`)])[0]?.description).toBe(exact);
  });

  test('"Put the key use case first": the cut keeps the start of the text', () => {
    const text = `key use case. ${'x'.repeat(2000)}`;
    expect(listed([described('a', text)])[0]?.description?.startsWith('key use case. xxx')).toBe(
      true,
    );
  });

  test('"Angle brackets in the text show as `&lt;` and `&gt;`"', () => {
    const entry = listed([described('deploy', 'Deploy <branch> to <env>')])[0];
    expect(entry?.description).toBe('Deploy &lt;branch&gt; to &lt;env&gt;');
  });

  test('"Square brackets ... displays as typed"', () => {
    expect(listed([described('deploy', 'Deploy [branch]')])[0]?.description).toBe(
      'Deploy [branch]',
    );
  });

  test('the same escaping shows in the `/` menu', () => {
    expect(menuEntries([described('deploy', 'Deploy <branch>')])[0]?.description).toBe(
      'Deploy &lt;branch&gt;',
    );
  });
});

spec('skills.frontmatter.when_to_use', () => {
  test('"Appended to `description` in the skill listing"', () => {
    const skill = described(
      'review',
      'Review a pull request',
      'when_to_use: "When the user asks for a review"',
    );
    const text = listed([skill])[0]?.description ?? '';
    expect(text.startsWith('Review a pull request')).toBe(true);
    expect(text.endsWith('When the user asks for a review')).toBe(true);
  });

  test('"counts toward the 1,536-character cap"', () => {
    const skill = described('a', 'd'.repeat(1500), `when_to_use: "${'w'.repeat(100)}"`);
    const text = listed([skill])[0]?.description ?? '';
    expect(text).toHaveLength(1536);
    expect(text.endsWith('w')).toBe(true);
    expect(text.indexOf('w')).toBeGreaterThan(1500);
  });

  test('a skill with only `when_to_use` lists that text', () => {
    const skill = named('a', 'when_to_use: "Use it for X"', 'Body line.');
    expect(listed([skill])[0]?.description).toContain('Use it for X');
  });

  test('angle brackets in it show as `&lt;` and `&gt;` too', () => {
    const skill = described('a', 'D', 'when_to_use: "Run for <branch>"');
    expect(listed([skill])[0]?.description).toContain('Run for &lt;branch&gt;');
  });
});

spec('skills.frontmatter.argument-hint', () => {
  test('"Hint shown during autocomplete": the `/` menu row carries it as written', () => {
    const skill = described('fix-issue', 'Fix an issue', 'argument-hint: "[issue-number]"');
    expect(menuEntries([skill])).toEqual([
      { name: 'fix-issue', description: 'Fix an issue', argumentHint: '[issue-number]' },
    ]);
  });

  test('a placeholder in `argument-hint` is not turned into `&lt;`', () => {
    const skill = described('deploy', 'Deploy', 'argument-hint: "<branch>"');
    expect(menuEntries([skill])[0]?.argumentHint).toBe('<branch>');
  });

  test('no hint is an empty string (the official row requires one)', () => {
    expect(menuEntries([described('deploy', 'Deploy')])[0]?.argumentHint).toBe('');
  });
});

const names = (
  skills: Parameters<typeof modelListing>[0],
  options?: Parameters<typeof modelListing>[1],
) => listed(skills, options).map((entry) => entry.name);

describe('the model listing: who is listed (skills.md § Control who invokes a skill, § Override skill visibility)', () => {
  test('a `disable-model-invocation` skill is not listed to the model, a `user-invocable: false` one is', () => {
    const manual = described('deploy', 'D', 'disable-model-invocation: true');
    const background = described('context', 'C', 'user-invocable: false');
    expect(names([manual, background])).toEqual(['context']);
  });

  test('the `/` menu lists the manual-only skill and not the `user-invocable: false` one', () => {
    const manual = described('deploy', 'D', 'disable-model-invocation: true');
    const background = described('context', 'C', 'user-invocable: false');
    expect(menuEntries([manual, background]).map((row) => row.name)).toEqual(['deploy']);
  });

  test('a plugin skill is listed by the name a user types: `plugin:skill`', () => {
    const plugin = skillWith('description: D', { name: 'review', origin: PLUGIN });
    expect(listed([plugin])[0]?.name).toBe('my-plugin:review');
  });
});

/**
 * `settings.key.skillOverrides` is claimed by the settings stream; its effect on the listing is
 * documented (skills.md § Override skill visibility from settings) and proven here without claiming it.
 */
describe('skillOverrides on the listing (skills.md § Override skill visibility from settings)', () => {
  test('on, name-only, user-invocable-only, off: what Claude sees and the `/` menu (the docs table)', () => {
    const skills = ['a', 'b', 'c', 'd'].map((name) => described(name, `desc ${name}`));
    const overrides = { b: 'name-only', c: 'user-invocable-only', d: 'off' } as const;
    expect(listed(skills, { overrides })).toEqual([
      { name: 'a', description: 'desc a' },
      { name: 'b' },
    ]);
    expect(menuEntries(skills, { overrides }).map((row) => row.name)).toEqual(['a', 'b', 'c']);
  });

  test('"Plugin skills are not affected by `skillOverrides`"', () => {
    const plugin = skillWith('name: deploy\ndescription: D', { origin: PLUGIN });
    const overrides = { deploy: 'off' } as const;
    expect(listed([plugin], { overrides })).toEqual([
      { name: 'my-plugin:deploy', description: 'D' },
    ]);
    expect(menuEntries([plugin], { overrides }).map((row) => row.name)).toEqual([
      'my-plugin:deploy',
    ]);
  });
});

const skills = (count: number, size = 100) =>
  Array.from({ length: count }, (_, at) => described(`skill-${at}`, `${at}`.padEnd(size, 'x')));

spec('skills.frontmatter.description', () => {
  test('"`skillListingMaxDescChars`" lowers or raises the cap (default 1536)', () => {
    const long = described('a', 'x'.repeat(3000));
    expect(listed([long], { maxDescChars: 50 })[0]?.description).toHaveLength(50);
    expect(listed([long], { maxDescChars: 2048 })[0]?.description).toHaveLength(2048);
    expect(listed([long])[0]?.description).toHaveLength(1536);
  });

  test('a cap that is not a positive integer is ignored', () => {
    const long = described('a', 'x'.repeat(2000));
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(listed([long], { maxDescChars: bad })[0]?.description).toHaveLength(1536);
    }
  });
});

spec('skills.behavior.Skill descriptions are cut short', () => {
  test('"keeps every skill\'s name but drops the descriptions": all names survive a tiny budget', () => {
    const result = modelListing(skills(5), { budget: { chars: 1 } });
    expect(result.entries.map((entry) => entry.name)).toEqual(skills(5).map((skill) => skill.name));
    expect(result.entries.every((entry) => entry.description === undefined)).toBe(true);
    expect(result.overBudget).toBe(true);
  });

  test('"drops descriptions starting with the skills you invoke least, so the skills you use most keep their full text"', () => {
    const all = skills(4);
    const full = all.reduce(
      (sum, skill) =>
        sum + listingLine({ name: skill.name, description: skill.description ?? '' }).length + 1,
      0,
    );
    // room for roughly three of the four descriptions
    const result = modelListing(all, {
      budget: { chars: full - 90 },
      usage: new Map([
        ['skill-0', 5],
        ['skill-1', 0],
        ['skill-2', 9],
        ['skill-3', 2],
      ]),
    });
    const byName = Object.fromEntries(
      result.entries.map((entry) => [entry.name, entry.description !== undefined]),
    );
    expect(byName).toEqual({ 'skill-0': true, 'skill-1': false, 'skill-2': true, 'skill-3': true });
    expect(result.descriptionsDropped).toEqual(['skill-1']);
    expect(result.overBudget).toBe(false);
  });

  test('"the combined text is capped at 1,536 characters regardless of budget": a roomy budget does not lift the cap', () => {
    const entry = listed([described('a', 'k'.repeat(3000))], { budget: { chars: 1_000_000 } })[0];
    expect(entry?.description).toHaveLength(1536);
  });

  test('"set low-priority entries to name-only ... so they list without a description" frees the budget for the others', () => {
    const all = skills(4);
    const budget = { chars: 400 };
    const crowded = modelListing(all, { budget });
    expect(crowded.descriptionsDropped.length).toBeGreaterThan(0);
    const relieved = modelListing(all, {
      budget,
      overrides: { 'skill-1': 'name-only', 'skill-2': 'name-only' },
    });
    expect(relieved.descriptionsDropped.length).toBeLessThan(crowded.descriptionsDropped.length);
    expect(relieved.entries.find((entry) => entry.name === 'skill-1')).toEqual({ name: 'skill-1' });
  });

  test('"The Skills row in /context reports the size of the listing after the budget is applied": `chars` is what the model receives', () => {
    const result = modelListing(skills(30), { budget: { chars: 1_500 } });
    const received = result.entries.map((entry) => `${listingLine(entry)}\n`).join('');
    expect(result.chars).toBe(received.length);
    expect(result.chars).toBeLessThanOrEqual(1_500);
  });

  test('within the budget nothing is dropped', () => {
    const result = modelListing(skills(3), { budget: { chars: 100_000 } });
    expect(result.descriptionsDropped).toEqual([]);
    expect(result.entries.every((entry) => entry.description !== undefined)).toBe(true);
  });
});

describe('listing details (judgments: spec/judgments.md)', () => {
  test('"The listing always contains every skill name": a skill with `paths` is a bare name until its paths activate it', () => {
    const gated = described('api-rules', 'API rules', 'paths: "src/api/**"');
    expect(listed([gated])).toEqual([{ name: 'api-rules' }]);
    expect(listed([gated], { activated: new Set(['api-rules']) })).toEqual([
      { name: 'api-rules', description: 'API rules' },
    ]);
  });

  test('a path-scoped skill is always in the `/` menu: the user can type its name', () => {
    const gated = described('api-rules', 'API rules', 'paths: "src/api/**"');
    expect(menuEntries([gated]).map((row) => row.name)).toEqual(['api-rules']);
  });

  test('description and when_to_use are joined by one space', () => {
    const skill = described('a', 'First.', 'when_to_use: "Second."');
    expect(listed([skill])[0]?.description).toBe('First. Second.');
  });

  test('the cap counts the text before escaping, so an entity is never cut in two', () => {
    const entry = listed([described('a', `${'x'.repeat(1535)}<>`)])[0];
    expect(entry?.description).toBe(`${'x'.repeat(1535)}&lt;`);
  });

  test('the cap counts characters, not UTF-16 units: an emoji is never split', () => {
    const entry = listed([described('a', `${'x'.repeat(1535)}😀😀`)])[0];
    expect(entry?.description).toBe(`${'x'.repeat(1535)}😀`);
  });

  test('a listing line is `- name: description`, and a bare name is `- name`', () => {
    expect(listingLine({ name: 'a', description: 'D' })).toBe('- a: D');
    expect(listingLine({ name: 'a' })).toBe('- a');
  });

  test('among skills used equally, the one listed last loses its description first', () => {
    const all = Array.from({ length: 3 }, (_, at) => described(`s${at}`, 'x'.repeat(100)));
    const result = modelListing(all, {
      budget: {
        chars: 2 * (listingLine({ name: 's0', description: 'x'.repeat(100) }).length + 1) + 10,
      },
    });
    expect(result.descriptionsDropped).toEqual(['s2']);
  });

  test('a `/` menu row of a command file or skill without description is empty only when the body is', () => {
    expect(menuEntries([named('x', '', 'Body line.')])[0]?.description).toBe('Body line.');
  });
});
