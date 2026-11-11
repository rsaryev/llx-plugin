import {
  isLeading,
  skillLookup,
  stackSkills,
  type Expansion,
  type LeadingMention,
  type SkillMention,
} from '../skills/index.ts';
import type { ExpandOptions, SkillInvoker } from './session-skill-expand.ts';
import type { SkillPart } from './session-skills.ts';
import type { SessionOptions } from './session-types.ts';
import { currentOf, type SessionCore } from './session-core.ts';

/** How a message is read: the host's commands that take another command as their arguments. */
export interface MentionOptions {
  /**
   * The host's commands whose arguments may start with another command (`/loop`): one ends the stack
   * (skills.md, "Stack several skills in one message"). The kit knows no bundled command.
   */
  readonly takesCommandArguments?: ReadonlySet<string>;
}

export interface MessageOptions extends MentionOptions {
  readonly signal: AbortSignal;
  /** Default `user`: the message was typed. */
  readonly invoker?: SkillInvoker;
}

/** One skill of the message, expanded; a mention the user may not invoke is a failed expansion. */
export interface MentionExpansion {
  readonly mention: LeadingMention;
  readonly expansion: Expansion;
}

/** Which skills a message names, read against the session's catalog; nothing is expanded. */
export interface MessageMentions {
  /** Every skill the message names, in order: the direct one, the stacked ones, then the named ones. */
  readonly mentions: readonly SkillMention[];
  /**
   * The listed commands of the direct and stacked skills `expandMessage` expands, in order; empty
   * when the message does not start with a skill of the catalog.
   */
  readonly leading: readonly string[];
  /** The text after the last leading skill: the `$ARGUMENTS` each of them gets. */
  readonly arguments: string;
  /**
   * The listed commands of the skills the message names after plain text (by any of their names).
   * They are not expanded; pass `permittedByMention: permitted.has(name)` to `expandSkill` for the
   * model's call in this message.
   */
  readonly permitted: ReadonlySet<string>;
}

export interface MessageExpansion extends MessageMentions {
  /** The direct and stacked skills of the message that exist in the catalog, in order, with the shared arguments. */
  readonly expansions: readonly MentionExpansion[];
}

export interface MentionPart {
  /** What `expandMessage` reads before it expands: the skills `message` names. No port is called. */
  messageMentions(message: string, options?: MentionOptions): MessageMentions;
  expandMessage(message: string, options: MessageOptions): Promise<MessageExpansion>;
}

/**
 * What a typed message asks of the skills (skills.md, "Stack several skills in one message",
 * "Where you write the skill's name"): `stackSkills` reads the message against every name of the
 * session's catalog (`skillCatalog`) with the turn's interactivity, and each skill of the stack is
 * expanded by `expandSkill` in order, so hooks, limits and the cap of six stay where they are.
 * Judgment (spec/judgments.md): a leading name that is no skill of the catalog is plain text for the
 * host (a built-in command, a path, a workflow) and is not expanded.
 */
export function createMentionPart(
  core: SessionCore,
  options: SessionOptions,
  skills: Pick<SkillPart, 'expandSkill' | 'skillCatalog'>,
): MentionPart {
  const read = (message: string, asked: MentionOptions = {}): MessageMentions => {
    const overrides = currentOf(core).state.view.get('skillOverrides');
    const lookup = skillLookup(skills.skillCatalog().skills);
    const stack = stackSkills(message, lookup, {
      interactive: options.interactive ?? true,
      ...(overrides === undefined ? {} : { overrides }),
      ...(asked.takesCommandArguments === undefined
        ? {}
        : { takesCommandArguments: asked.takesCommandArguments }),
    });
    const permitted = new Set(
      stack.mentions
        .filter((mention) => !isLeading(mention))
        .map((mention) => lookup.find(mention.command)?.invocable.command ?? mention.command),
    );
    return {
      mentions: stack.mentions,
      leading: stack.skills.map((row) => row.invocable.command),
      arguments: stack.arguments,
      permitted,
    };
  };
  return {
    messageMentions: read,
    async expandMessage(message, request) {
      const found = read(message, request);
      const asked: ExpandOptions = {
        arguments: found.arguments,
        signal: request.signal,
        ...(request.invoker === undefined ? {} : { invoker: request.invoker }),
      };
      const leading = found.mentions.filter(isLeading);
      const expansions: MentionExpansion[] = [];
      for (const [index, command] of found.leading.entries()) {
        const mention = leading[index];
        if (mention === undefined) continue;
        expansions.push({ mention, expansion: await skills.expandSkill(command, asked) });
      }
      return { ...found, expansions };
    },
  };
}
