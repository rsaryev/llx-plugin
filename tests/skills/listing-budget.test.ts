/**
 * skills.md § Skill descriptions are cut short ("The budget scales at 1% of the model's context
 * window"), env-vars.md (`SLASH_COMMAND_TOOL_CHAR_BUDGET`: "a fallback of 8,000 characters"),
 * settings-reference.md (`skillListingBudgetFraction`: "greater than 0 and at most 1"). The drop
 * order and the cap of one description are in listing.test.ts.
 */
import { expect, test } from 'bun:test';
import { FALLBACK_BUDGET_CHARS, listingLine, modelListing } from '../../src/skills/listing.ts';
import { skillWith } from '../support/skills.ts';
import { spec } from '../support/spec.ts';

/** Forty skills with names of one width and a 400-character description each. */
const DESCRIPTION = 'x'.repeat(400);
const MANY = Array.from({ length: 40 }, (_, at) => {
  const name = `s${String(at).padStart(2, '0')}`;
  return skillWith(`name: ${name}\ndescription: ${JSON.stringify(DESCRIPTION)}\n`, { name });
});

/** The characters one listing line takes, with or without the description. */
const lineCost = (withDescription: boolean) =>
  listingLine({ name: 's00', ...(withDescription ? { description: DESCRIPTION } : {}) }).length + 1;
/** How many of the forty keep their description within `limit` characters. */
const keptWithin = (limit: number) =>
  Math.min(40, Math.floor((limit - 40 * lineCost(false)) / (lineCost(true) - lineCost(false))));
const keptIn = (result: ReturnType<typeof modelListing>) =>
  result.entries.filter((entry) => entry.description !== undefined).length;

spec(
  [
    'skills.behavior.Skill descriptions are cut short',
    'environment.host.SLASH_COMMAND_TOOL_CHAR_BUDGET',
  ],
  () => {
    test('"The budget scales at 1% of the model\'s context window": exactly `floor(window * 0.01 * 4)` characters', () => {
      for (const contextWindow of [200_000, 123_457]) {
        const limit = Math.floor(contextWindow * 0.01 * 4);
        const result = modelListing(MANY, { budget: { contextWindow } });
        expect(keptIn(result)).toBe(keptWithin(limit));
        expect(result.chars).toBeLessThanOrEqual(limit);
        expect(result.chars + (lineCost(true) - lineCost(false))).toBeGreaterThan(limit);
        expect(result.overBudget).toBe(false);
      }
    });

    test('`skillListingBudgetFraction` replaces the 1%: exactly `floor(window * fraction * 4)`', () => {
      for (const fraction of [0.05, 0.5, 1]) {
        const limit = Math.floor(200_000 * fraction * 4);
        const result = modelListing(MANY, { budget: { contextWindow: 200_000, fraction } });
        expect(keptIn(result)).toBe(keptWithin(limit));
        expect(result.chars).toBeLessThanOrEqual(limit);
      }
    });

    test('a fraction that is not greater than 0 and at most 1 falls back to 0.01', () => {
      const standard = modelListing(MANY, { budget: { contextWindow: 200_000 } });
      for (const fraction of [0, -0.5, 1.5, 2, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(modelListing(MANY, { budget: { contextWindow: 200_000, fraction } })).toEqual(
          standard,
        );
      }
      expect(modelListing(MANY, { budget: { contextWindow: 200_000, fraction: 1 } })).not.toEqual(
        standard,
      );
    });

    test('a fixed character count (`SLASH_COMMAND_TOOL_CHAR_BUDGET`) replaces the fraction of the window', () => {
      const fixed = modelListing(MANY, {
        budget: { contextWindow: 200_000, fraction: 0.5, chars: 3000 },
      });
      expect(keptIn(fixed)).toBe(keptWithin(3000));
      expect(fixed.chars).toBeLessThanOrEqual(3000);
    });

    test('a character count that is not a positive integer is ignored: the window decides', () => {
      const byWindow = modelListing(MANY, { budget: { contextWindow: 200_000 } });
      for (const chars of [0, -5, 1.5, Number.NaN]) {
        expect(modelListing(MANY, { budget: { contextWindow: 200_000, chars } })).toEqual(byWindow);
      }
    });

    test('"with a fallback of 8,000 characters": no budget, or a window that is not a positive integer', () => {
      expect(FALLBACK_BUDGET_CHARS).toBe(8000);
      expect(keptWithin(8000)).toBeLessThan(40);
      const budgets = [
        undefined,
        {},
        { contextWindow: 0 },
        { contextWindow: Number.NaN },
        { contextWindow: 1.5 },
        { fraction: 0.5 },
      ];
      for (const budget of budgets) {
        const result = modelListing(MANY, budget === undefined ? {} : { budget });
        expect(keptIn(result)).toBe(keptWithin(8000));
        expect(result.chars).toBeLessThanOrEqual(8000);
      }
    });

    test('a short listing is under the fallback and nothing is dropped', () => {
      const result = modelListing(MANY.slice(0, 5));
      expect(result.descriptionsDropped).toEqual([]);
      expect(keptIn(result)).toBe(5);
    });
  },
);
