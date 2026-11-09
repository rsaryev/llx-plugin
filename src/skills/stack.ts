import { invocationPolicy, type Invocable } from './invocation.ts';
import { readSkillMentions, type MentionOptions } from './mention.ts';
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

export interface Stack<T extends Invocable = Invocable> {
  /** The skills to expand, in the order typed: the first, then the ones stacked after it. */
  readonly skills: readonly T[];
  /** The text after the last expanded skill: passed as `$ARGUMENTS` to each of them. */
  readonly arguments: string;
}

/** Whether a skill may be stacked after another: inline (no `context: fork`), user-invocable, not open-ended. */
const stackableAfter =
  (options: StackOptions) =>
  (skill: Invocable): boolean =>
    skill.context === undefined &&
    invocationPolicy(skill, options.overrides).user &&
    options.takesCommandArguments?.has(skill.command) !== true;

/**
 * The skills a message starts with and the argument text they share. An empty stack when the
 * message does not start with the name of a skill of the session; the host then treats it as text.
 */
export function stackSkills<T extends Invocable>(
  message: string,
  catalog: readonly T[],
  options: StackOptions = {},
): Stack<T> {
  const byCommand = new Map(catalog.map((skill) => [skill.command, skill]));
  const canStack = stackableAfter(options);
  const mentionOptions: MentionOptions = {
    ...(options.interactive === undefined ? {} : { interactive: options.interactive }),
    stackable: (command) => {
      const skill = byCommand.get(command);
      return skill !== undefined && canStack(skill);
    },
    names: new Set(byCommand.keys()),
  };
  const leading = readSkillMentions(message, mentionOptions).filter(
    (mention) => mention.how !== 'named',
  );
  const skills = leading.flatMap((mention) => byCommand.get(mention.command) ?? []);
  const [first] = leading;
  return first === undefined || skills.length !== leading.length
    ? { skills: [], arguments: '' }
    : { skills, arguments: first.arguments };
}
