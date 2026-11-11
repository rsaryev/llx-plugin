/**
 * The model listing where the docs leave a detail open: spec/judgments.md rows for
 * `src/skills/listing.ts` (oracle 2.1.319: separator, undescribed skills, cut-off characters, budget).
 */
import { describe, expect, test } from 'bun:test';
import { invocationPolicy } from '../../src/skills/invocation.ts';
import { listingLine, menuEntries, modelListing } from '../../src/skills/listing.ts';
import { described, listed, named } from '../support/skills.ts';

describe('listing details (judgments: spec/judgments.md)', () => {
  // oracle 2.1.319: Claude Code lists a skill or command to the model only when its frontmatter sets
  // `description` or `when_to_use`; the first body line then stands in for a missing description.
  test('with neither `description` nor `when_to_use` the model is not told about it', () => {
    const bare = named('notes', '', 'Take notes about the session.');
    const blank = named('blank', 'description: "   "', 'Body line.');
    expect(listed([bare, blank])).toEqual([]);
    expect(menuEntries([bare]).map((entry) => entry.name)).toEqual(['notes']);
    expect(invocationPolicy(bare).model).toBe(true);
  });

  test('`when_to_use` alone lists it, with the first body line as the description', () => {
    const skill = named('notes', 'when_to_use: when asked', 'Take notes.');
    expect(listed([skill])).toEqual([{ name: 'notes', description: 'Take notes. - when asked' }]);
  });

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

  test('oracle 2.1.319: description and when_to_use are joined by " - "', () => {
    const skill = described('a', 'First.', 'when_to_use: "Second."');
    expect(listed([skill])[0]?.description).toBe('First. - Second.');
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
