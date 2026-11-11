import { escapeAngleBrackets } from '../format/skill-fields.ts';
import type { SlashCommand } from '../protocol/official.ts';
import { invocationPolicy, type Invocable } from './invocation.ts';
import type { ModelListing, SkillOverrides } from './visibility.ts';
import { CHARS_PER_TOKEN } from '../format/token-estimate.ts';

/**
 * What the model and the `/` menu are told about the skills (skills.md, "Skill descriptions are cut
 * short", "Angle brackets in a skill description", "Override skill visibility from settings";
 * settings-reference.md, `skillListingMaxDescChars` and `skillListingBudgetFraction`). Pure: the host
 * passes the settings, the usage counts and the model's context window in.
 */

/** `skillListingMaxDescChars` default: "capped at 1,536 characters". */
const DEFAULT_MAX_DESCRIPTION_CHARS = 1536;
/** `skillListingBudgetFraction` default: "reserves 1% of the context window". */
const DEFAULT_BUDGET_FRACTION = 0.01;
/**
 * Judgment (spec/judgments.md): the docs size the budget as a share of "the model's context window"
 * and the SDK says the fraction is "in characters", without saying how a window in tokens becomes
 * characters: `CHARS_PER_TOKEN`, the kit's one token estimate.
 */
/**
 * `SLASH_COMMAND_TOOL_CHAR_BUDGET`: "The budget scales dynamically at 1% of the context window, with a
 * fallback of 8,000 characters." The fallback applies when the host gives neither a window nor a count.
 */
export const FALLBACK_BUDGET_CHARS = 8000;

export interface ListingBudget {
  /** The model's context window in tokens. */
  readonly contextWindow?: number;
  /** `skillListingBudgetFraction`, greater than 0 and at most 1 (default 0.01). */
  readonly fraction?: number;
  /** A fixed character count (`SLASH_COMMAND_TOOL_CHAR_BUDGET`): it replaces the fraction of the window. */
  readonly chars?: number;
}

export interface ListingOptions {
  /** `skillOverrides`. */
  readonly overrides?: SkillOverrides;
  /** `skillListingMaxDescChars` (default 1536). */
  readonly maxDescChars?: number;
  /** With neither a window nor a character count the budget is 8,000 characters. */
  readonly budget?: ListingBudget;
  /** How often each skill (by command name) was invoked; absent counts as never. */
  readonly usage?: ReadonlyMap<string, number>;
  /**
   * The command names of skills whose `paths` have activated them in this session. Until then a
   * path-scoped skill is listed by name alone (the listing "always contains every skill name").
   */
  readonly activated?: ReadonlySet<string>;
}

export interface ListingEntry {
  readonly name: string;
  /** Absent for a name-only skill and for one whose description the budget dropped. */
  readonly description?: string;
}

/**
 * A command that is listed ahead of the skills with its description as written: a plugin's workflow
 * (oracle 2.1.319, spec/judgments.md). The description is cut and escaped as a skill's is.
 */
export interface LeadingCommand {
  readonly name: string;
  readonly description: string;
}

export interface ModelListingResult {
  readonly entries: readonly ListingEntry[];
  /** The skills that lost their description to the budget, in the order they lost it. */
  readonly descriptionsDropped: readonly string[];
  /** The characters the listing takes. */
  readonly chars: number;
  /** Still over the budget with every dropable description gone: names are never dropped. */
  readonly overBudget: boolean;
}

/** Judgment: the docs give the content of a line, not its form. */
export const listingLine = (entry: ListingEntry): string =>
  entry.description === undefined ? `- ${entry.name}` : `- ${entry.name}: ${entry.description}`;

const lineCost = (entry: ListingEntry): number => listingLine(entry).length + 1;

const isPositiveInteger = (value: number | undefined): value is number =>
  value !== undefined && Number.isInteger(value) && value > 0;

/** The first `limit` characters (code points, so a surrogate pair is never split). */
const firstCharacters = (text: string, limit: number): string => {
  const characters = Array.from(text);
  return characters.length <= limit ? text : characters.slice(0, limit).join('');
};

/**
 * `description` with `when_to_use` appended, cut at the cap, then shown with `<` and `>` escaped.
 * Judgment, oracle 2.1.319: the two are joined by " - ", as Claude Code's listing shows them.
 */
function describe(skill: Invocable, cap: number): string {
  const text = [skill.description, skill.whenToUse]
    .filter((part): part is string => part !== undefined && part !== '')
    .join(' - ');
  return escapeAngleBrackets(firstCharacters(text, cap));
}

/** The character budget. */
function budgetChars(budget: ListingBudget | undefined): number {
  if (budget === undefined) return FALLBACK_BUDGET_CHARS;
  if (isPositiveInteger(budget.chars)) return budget.chars;
  if (!isPositiveInteger(budget.contextWindow)) return FALLBACK_BUDGET_CHARS;
  const fraction = budget.fraction ?? DEFAULT_BUDGET_FRACTION;
  const valid = fraction > 0 && fraction <= 1 ? fraction : DEFAULT_BUDGET_FRACTION;
  return Math.floor(budget.contextWindow * valid * CHARS_PER_TOKEN);
}

/** It sets `paths` and no touched file has activated it yet: the listing names it alone. */
export const isDormant = (skill: Invocable, activated?: ReadonlySet<string>): boolean =>
  skill.paths.length > 0 && activated?.has(skill.command) !== true;

/**
 * What the model's listing says of a skill before the budget: its description, its name alone (a
 * `name-only` override, a dormant `paths` skill), or nothing (`disable-model-invocation`, a hiding
 * override, no description: still invocable through the Skill tool, oracle 2.1.319).
 */
export function listedAs(
  skill: Invocable,
  options: Pick<ListingOptions, 'overrides' | 'activated'> = {},
): ModelListing {
  const { listedToModel } = invocationPolicy(skill, options.overrides);
  if (listedToModel === 'hidden' || skill.undescribed === true) return 'hidden';
  return isDormant(skill, options.activated) ? 'name' : listedToModel;
}

/** The skill's entry in the model's listing, or `undefined` when the model is not told about it. */
const ENTRY_OF: {
  readonly [L in ModelListing]: (skill: Invocable, cap: number) => ListingEntry | undefined;
} = {
  description: (skill, cap) => ({ name: skill.command, description: describe(skill, cap) }),
  name: (skill) => ({ name: skill.command }),
  hidden: () => undefined,
};

/**
 * The skills the model reads about, with the description of the least used dropped first until the
 * listing fits the budget. Among equally used skills the one listed last loses it first (judgment).
 */
export function modelListing(
  skills: readonly Invocable[],
  options: ListingOptions = {},
  leading: readonly LeadingCommand[] = [],
): ModelListingResult {
  const cap = isPositiveInteger(options.maxDescChars)
    ? options.maxDescChars
    : DEFAULT_MAX_DESCRIPTION_CHARS;
  const entries: ListingEntry[] = leading.map((row) => ({
    name: row.name,
    description: escapeAngleBrackets(firstCharacters(row.description, cap)),
  }));
  const used: number[] = leading.map((row) => options.usage?.get(row.name) ?? 0);
  for (const skill of skills) {
    const entry = ENTRY_OF[listedAs(skill, options)](skill, cap);
    if (entry === undefined) continue;
    entries.push(entry);
    used.push(options.usage?.get(skill.command) ?? 0);
  }
  return fitBudget(entries, used, budgetChars(options.budget));
}

function fitBudget(
  entries: ListingEntry[],
  used: readonly number[],
  limit: number,
): ModelListingResult {
  const order = entries
    .map((entry, at) => ({ at, uses: used[at] ?? 0, described: entry.description !== undefined }))
    .filter((candidate) => candidate.described)
    .toSorted((left, right) => left.uses - right.uses || right.at - left.at);
  let chars = entries.reduce((sum, entry) => sum + lineCost(entry), 0);
  const dropped: string[] = [];
  for (const candidate of order) {
    if (chars <= limit) break;
    const entry = entries[candidate.at];
    if (entry === undefined) continue;
    const bare = { name: entry.name };
    chars += lineCost(bare) - lineCost(entry);
    entries[candidate.at] = bare;
    dropped.push(entry.name);
  }
  return {
    entries,
    descriptionsDropped: dropped,
    chars,
    overBudget: chars > limit,
  };
}

export interface MenuOptions {
  readonly overrides?: SkillOverrides;
}

/**
 * The rows of the `/` menu, in the official `SlashCommand` shape: the skills a user may type
 * (`user-invocable: false` and an `off` override are hidden). The row shows the description with
 * `<` and `>` escaped; judgment: not `when_to_use`, which the docs append only "in the skill
 * listing", and not capped. `argument-hint` is shown as written.
 */
export function menuEntries(
  skills: readonly Invocable[],
  options: MenuOptions = {},
  leading: readonly LeadingCommand[] = [],
): SlashCommand[] {
  const first = leading.map((row) => ({
    name: row.name,
    description: escapeAngleBrackets(row.description),
    argumentHint: '',
  }));
  const rest = skills
    .filter((skill) => invocationPolicy(skill, options.overrides).inMenu)
    .map((skill) => ({
      name: skill.command,
      description: escapeAngleBrackets(skill.description ?? ''),
      argumentHint: skill.argumentHint ?? '',
    }));
  return [...first, ...rest];
}
