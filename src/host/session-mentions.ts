import {
  readSkillMentions,
  stackableOf,
  type SkillMention,
  type Expansion,
} from '../skills/index.ts';
import { entriesOf, invocablesOf } from './session-skill-entries.ts';
import type { ExpandOptions, SkillInvoker, SkillPart } from './session-skills.ts';
import type { SessionOptions } from './session-types.ts';
import { currentOf, type SessionCore } from './session-core.ts';

export interface MessageOptions {
  readonly signal: AbortSignal;
  /** Default `user`: the message was typed. */
  readonly invoker?: SkillInvoker;
}

/** One skill of the message, expanded; a mention the user may not invoke is a failed expansion. */
export interface MentionExpansion {
  readonly mention: Extract<SkillMention, { how: 'direct' | 'stacked' }>;
  readonly expansion: Expansion;
}

export interface MessageExpansion {
  /** Every skill the message names, in order: the direct one, the stacked ones, then the named ones. */
  readonly mentions: readonly SkillMention[];
  /** The direct and stacked skills of the message that exist in the catalog, in order, with the shared arguments. */
  readonly expansions: readonly MentionExpansion[];
  /**
   * The commands the message names after plain text. They are not expanded; pass
   * `permittedByMention: permitted.has(name)` to `expandSkill` for the model's call in this message.
   */
  readonly permitted: ReadonlySet<string>;
}

export interface MentionPart {
  expandMessage(message: string, options: MessageOptions): Promise<MessageExpansion>;
}

const leads = (
  mention: SkillMention,
): mention is Extract<SkillMention, { how: 'direct' | 'stacked' }> => mention.how !== 'named';

/**
 * What a typed message asks of the skills (skills.md, "Stack several skills in one message",
 * "Where you write the skill's name"): the mentions are read with the turn's interactivity and the
 * catalog's inline, user-invocable skills as the stack, and each skill that starts the message is
 * expanded by `expandSkill` in order, so hooks, limits and the cap of six stay where they are.
 * Judgment (spec/judgments.md): a leading name that is no skill of the catalog is plain text for the
 * host (a built-in command, a path) and is not expanded.
 */
export function createMentionPart(
  core: SessionCore,
  options: SessionOptions,
  skills: Pick<SkillPart, 'expandSkill'>,
): MentionPart {
  return {
    async expandMessage(message, request) {
      const { state } = currentOf(core);
      const entries = entriesOf(state);
      const known = new Set(entries.map((entry) => entry.invocable.command));
      const stackable = stackableOf(invocablesOf(entries), state.view.get('skillOverrides'));
      const mentions = readSkillMentions(message, {
        interactive: options.interactive ?? true,
        stackable,
      });
      const expansions: MentionExpansion[] = [];
      for (const mention of mentions.filter(leads)) {
        if (!known.has(mention.command)) continue;
        const asked: ExpandOptions = {
          arguments: mention.arguments,
          signal: request.signal,
          ...(request.invoker === undefined ? {} : { invoker: request.invoker }),
        };
        expansions.push({ mention, expansion: await skills.expandSkill(mention.command, asked) });
      }
      const permitted = new Set(
        mentions.filter((mention) => mention.how === 'named').map((mention) => mention.command),
      );
      return { mentions, expansions, permitted };
    },
  };
}
