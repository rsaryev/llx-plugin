import { invocationPolicy } from './invocation.ts';
import type { NamedInvocable, SkillLookup } from './lookup.ts';
import { isLeading, readSkillMentions, type SkillMention } from './mention.ts';
import type { SkillOverrides } from './visibility.ts';

/**
 * Several skills in one message (skills.md, "Stack several skills in one message"): at the terminal
 * prompt `/write-tests /fix-issue 123` loads both skills and passes `123` to each. "Claude Code
 * expands the first skill plus up to five more stacked after it. Expansion stops at the first token
 * that isn't an inline user-invocable skill": a skill that runs as a forked subagent, or one whose
 * arguments may start with another command, ends it, and that token and everything after become the
 * argument text for every expanded skill. `readSkillMentions` finds the words; this decides which
 * of them are skills of the session that may be stacked.
 */

export interface StackOptions {
  /** True at the terminal prompt (the default); through the Agent SDK or `claude -p` only the first skill loads. */
  readonly interactive?: boolean;
  readonly overrides?: SkillOverrides;
  /**
   * The commands whose arguments may start with another command (`/loop`): "expansion ends there".
   * The kit knows no bundled command, so the host names them.
   */
  readonly takesCommandArguments?: ReadonlySet<string>;
}

export interface Stack<E extends NamedInvocable> {
  /** The skills to expand, in the order typed: the first, then the ones stacked after it. */
  readonly skills: readonly E[];
  /** The text after the last expanded skill: passed as `$ARGUMENTS` to each of them. */
  readonly arguments: string;
  /** Every mention of the message as written: the direct and stacked ones, then the named ones. */
  readonly mentions: readonly SkillMention[];
}

/** Whether a skill may be stacked after another: inline (no `context: fork`), user-invocable, not open-ended. */
const stackableAfter =
  (options: StackOptions) =>
  ({ invocable }: NamedInvocable): boolean =>
    invocable.context === undefined &&
    invocationPolicy(invocable, options.overrides).user &&
    options.takesCommandArguments?.has(invocable.command) !== true;

/**
 * The skills a message starts with and the argument text they share. No skills when the message
 * does not start with a name of the catalog; the host then treats it as text.
 */
export function stackSkills<E extends NamedInvocable>(
  message: string,
  catalog: SkillLookup<E>,
  options: StackOptions = {},
): Stack<E> {
  const canStack = stackableAfter(options);
  const mentions = readSkillMentions(message, {
    ...(options.interactive === undefined ? {} : { interactive: options.interactive }),
    stackable: (name) => {
      const row = catalog.find(name);
      return row !== undefined && canStack(row);
    },
    names: catalog.names,
  });
  const leading = mentions.filter(isLeading);
  const skills = leading.flatMap((mention) => catalog.find(mention.command) ?? []);
  const [first] = leading;
  return first === undefined || skills.length !== leading.length
    ? { skills: [], arguments: '', mentions }
    : { skills, arguments: first.arguments, mentions };
}
