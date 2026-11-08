/**
 * Where a message names a skill (skills.md, "Control who invokes a skill", "Where you write the
 * skill's name"). A name at the start runs the skill directly; after plain text, "as a separate word
 * with no punctuation attached", it only counts as the user's permission for that message. The
 * reader finds the words; whether a skill of that name exists, and may run (`checkInvocation`), is
 * the host's next step.
 *
 * "Stack several skills in one message": at the terminal prompt `/write-tests /fix-issue 123` loads
 * both skills and passes `123` to each; the first plus up to five more are expanded, and expansion
 * stops at the first token that is not an inline user-invocable skill. Through `-p` or the Agent SDK
 * only the first skill loads, with the rest of the line as its arguments.
 */

export type SkillMention =
  | { readonly how: 'direct'; readonly command: string; readonly arguments: string }
  /** A skill stacked after the direct one: it gets the same trailing `arguments`. */
  | { readonly how: 'stacked'; readonly command: string; readonly arguments: string }
  | { readonly how: 'named'; readonly command: string };

/** "The first skill plus up to five more stacked after it". */
const MAX_STACKED_SKILLS = 6;

export interface MentionOptions {
  /** True at the terminal prompt (the default); false through `-p` or the Agent SDK: only the first skill loads. */
  readonly interactive?: boolean;
  /**
   * Whether a command is an inline, user-invocable skill: a name that is not (a forked skill such as
   * `/code-review`, `/loop`, an unknown name) ends the stack and starts the arguments. Absent: every
   * name qualifies, so the host should pass it.
   */
  readonly stackable?: (command: string) => boolean;
  /**
   * The names the session lists, so a directory-qualified name (`/apps/web:deploy`, `/b/cli:verify`)
   * is one word although it holds `/`: a word that is exactly `/<a listed name>` is a mention.
   */
  readonly names?: ReadonlySet<string>;
}

/**
 * A word that is a skill name and nothing else: letters, digits, `_`, `-` and the plugin `:`. Any
 * other character in the word is "punctuation attached" (`/deploy,`, `/usr/bin`) and the word is
 * not a mention. Judgment: the docs give the rule, not the alphabet of a name.
 */
const NAME_WORD = /^[\p{L}\p{N}_:-]+$/u;
const WORD = /\S+/gu;

const nameOf = (word: string, options: MentionOptions): string | undefined => {
  if (!word.startsWith('/')) return undefined;
  const name = word.slice(1);
  return NAME_WORD.test(name) || options.names?.has(name) === true ? name : undefined;
};

const isStackable = (options: MentionOptions, command: string): boolean =>
  options.stackable?.(command) ?? true;

/** The names stacked after the first, up to the limit of six skills in all, ending at the first that cannot be. */
function stackedNames(
  first: string,
  following: readonly string[],
  options: MentionOptions,
): string[] {
  if (options.interactive === false || !isStackable(options, first)) return [];
  const stacked: string[] = [];
  for (const word of following.slice(0, MAX_STACKED_SKILLS - 1)) {
    const name = nameOf(word, options);
    if (name === undefined || !isStackable(options, name)) break;
    stacked.push(name);
  }
  return stacked;
}

/** The mentions of the skills at the start of the message: the direct one and the stacked ones. */
function readLeading(message: string, options: MentionOptions): SkillMention[] {
  const text = message.trimStart();
  const words = [...text.matchAll(WORD)];
  const direct = nameOf(words[0]?.[0] ?? '', options);
  if (direct === undefined) return [];
  const stacked = stackedNames(
    direct,
    words.slice(1).map(([word]) => word),
    options,
  );
  const last = words[stacked.length];
  const rest = last === undefined ? '' : text.slice(last.index + last[0].length).trim();
  return [
    { how: 'direct', command: direct, arguments: rest },
    ...stacked.map((command): SkillMention => ({ how: 'stacked', command, arguments: rest })),
  ];
}

export function readSkillMentions(message: string, options: MentionOptions = {}): SkillMention[] {
  const mentions = readLeading(message, options);
  const seen = new Set(mentions.map((mention) => mention.command));
  for (const [word] of message.matchAll(WORD)) {
    const name = nameOf(word, options);
    if (name === undefined || seen.has(name)) continue;
    seen.add(name);
    mentions.push({ how: 'named', command: name });
  }
  return mentions;
}
