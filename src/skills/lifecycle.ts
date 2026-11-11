import { CHARS_PER_TOKEN, estimateTokens } from '../format/token-estimate.ts';

/**
 * What happens to a skill's content once it is invoked (skills.md, "Skill content lifecycle"): the
 * rendered `SKILL.md` "enters the conversation as a single message and stays there across later
 * turns", the file is not re-read, an `allowed-tools` grant clears at the next user message, a
 * re-invocation with identical rendered content adds a short note instead of a second copy, and
 * auto-compaction re-attaches the most recent invocation of each skill within a token budget. Pure:
 * the ledger is a value the host keeps next to its conversation.
 */

/** "keeping the first 5,000 tokens of each". */
export const REATTACH_TOKENS_PER_SKILL = 5_000;
/** "Re-attached skills share a combined budget of 25,000 tokens." */
export const REATTACH_TOKENS_TOTAL = 25_000;
/*
 * Judgment (spec/judgments.md): the docs count tokens and give no tokenizer, so the kit counts
 * by `estimateTokens` (format/token-estimate.ts); a host with a tokenizer passes its own counter.
 */

export interface TokenCounter {
  readonly count: (text: string) => number;
  /** The first `tokens` tokens of `text`. */
  readonly head: (text: string, tokens: number) => string;
}

const CHARACTER_TOKENS: TokenCounter = {
  count: estimateTokens,
  head: (text, tokens) =>
    Array.from(text)
      .slice(0, tokens * CHARS_PER_TOKEN)
      .join(''),
};

/** One invocation that is in the conversation. */
export interface LoadedSkill {
  readonly command: string;
  /** The rendered content, as the model received it. */
  readonly content: string;
  /** Order of invocation, starting at 1: the most recent has the highest. */
  readonly order: number;
}

export interface SkillLedger {
  /** The copies of skill content in the conversation, in the order they entered (one skill may have several). */
  readonly loaded: readonly LoadedSkill[];
  /** The `allowed-tools` grants in force for the current turn only. */
  readonly grants: readonly string[];
  /** The `disallowed-tools` in force for the current turn only. */
  readonly disallowed: readonly string[];
}

export const EMPTY_LEDGER: SkillLedger = { loaded: [], grants: [], disallowed: [] };

export interface Invocation {
  readonly command: string;
  /** The rendered content: arguments and `` !`command` `` output already in it. */
  readonly content: string;
  readonly grants?: readonly string[];
  readonly disallowed?: readonly string[];
}

/** What enters the conversation for an invocation. */
export type SkillDelivery =
  | { readonly kind: 'content'; readonly text: string }
  | { readonly kind: 'already-loaded'; readonly text: string };

/**
 * Judgment (spec/judgments.md): the docs say "a short note that the skill is already loaded"
 * without wording.
 */
const alreadyLoadedNote = (command: string): string =>
  `The skill /${command} is already loaded in this conversation with the same content.`;

const latestOf = (ledger: SkillLedger, command: string): LoadedSkill | undefined =>
  ledger.loaded.findLast((entry) => entry.command === command);

/**
 * Records an invocation. Identical rendered content to the copy already in context gives the note;
 * "When the rendered content differs, because the arguments changed or a dynamic context command
 * produced new output, Claude Code appends the full content again." The invocation re-applies its
 * grants and removals for this turn either way.
 */
export function invokeSkill(
  ledger: SkillLedger,
  invocation: Invocation,
): { readonly ledger: SkillLedger; readonly delivery: SkillDelivery } {
  const { command, content } = invocation;
  const previous = latestOf(ledger, command);
  const same = previous?.content === content;
  const order = (ledger.loaded.at(-1)?.order ?? 0) + 1;
  // Judgment (spec/judgments.md): a re-invocation that only adds the note still makes the skill the
  // most recently invoked, so compaction ranks it by that invocation.
  const loaded = same
    ? ledger.loaded.map((entry) => (entry === previous ? { ...entry, order } : entry))
    : [...ledger.loaded, { command, content, order }];
  return {
    ledger: {
      loaded,
      grants: [...ledger.grants, ...(invocation.grants ?? [])],
      disallowed: [...ledger.disallowed, ...(invocation.disallowed ?? [])],
    },
    delivery: same
      ? { kind: 'already-loaded', text: alreadyLoadedNote(command) }
      : { kind: 'content', text: content },
  };
}

/**
 * The user sends a message: the skills' content stays, but "an `allowed-tools` grant clears when you
 * send your next message", and so does the `disallowed-tools` restriction.
 */
export const startTurn = (ledger: SkillLedger): SkillLedger => ({
  ...ledger,
  grants: [],
  disallowed: [],
});

export interface ReattachOptions {
  readonly perSkillTokens?: number;
  readonly totalTokens?: number;
  readonly tokens?: TokenCounter;
}

/**
 * What auto-compaction carries forward after the summary: the most recent invocation of each skill,
 * the first 5,000 tokens of each, filled into a 25,000-token budget "starting from the most recently
 * invoked skill, so older skills can be dropped entirely". Judgment (spec/judgments.md): a skill
 * that no longer fits is dropped whole, and so is every older one. Returned oldest first, as they
 * were invoked.
 */
export function reattachAfterCompaction(
  ledger: SkillLedger,
  options: ReattachOptions = {},
): readonly LoadedSkill[] {
  const { perSkillTokens = REATTACH_TOKENS_PER_SKILL, totalTokens = REATTACH_TOKENS_TOTAL } =
    options;
  const counter = options.tokens ?? CHARACTER_TOKENS;
  const latest = [...new Set(ledger.loaded.map((entry) => entry.command))]
    .map((command) => latestOf(ledger, command))
    .filter((entry): entry is LoadedSkill => entry !== undefined)
    .toSorted((left, right) => right.order - left.order);
  const kept: LoadedSkill[] = [];
  let used = 0;
  for (const entry of latest) {
    const content = counter.head(entry.content, perSkillTokens);
    const size = Math.min(counter.count(content), perSkillTokens);
    if (used + size > totalTokens) break;
    used += size;
    kept.push({ ...entry, content });
  }
  return kept.toReversed();
}
