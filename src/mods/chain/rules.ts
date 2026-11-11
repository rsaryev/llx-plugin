import type { EventRule, EventRuleBook } from '../types.ts';

/** The rule of an event no part of mods knows: results and changed events pass through. */
const NO_RULE: EventRule = {};

/** The rules the chain reads, one per event: each part of mods contributes the events it owns. */
export type RuleRegistry = ReadonlyMap<string, EventRule>;

/**
 * One registry from the books of the parts of mods (the events, the mods API calls, the interface,
 * `plugin.register`). An event belongs to one part, so a second book that names it is a mistake of
 * the kit's and throws.
 */
export function ruleRegistry(...books: readonly EventRuleBook[]): RuleRegistry {
  const rules = new Map<string, EventRule>();
  for (const [event, rule] of books.flatMap((book) => Object.entries(book))) {
    if (rules.has(event)) throw new Error(`${event} has rules in two parts of mods`);
    rules.set(event, rule);
  }
  return rules;
}

/** The rule of `event`, or one that passes everything through. */
export const ruleOf = (registry: RuleRegistry, event: string): EventRule =>
  registry.get(event) ?? NO_RULE;
