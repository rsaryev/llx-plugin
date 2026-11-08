/**
 * Where a message names a skill (skills.md, "Control who invokes a skill", "Where you write the
 * skill's name"). A name at the start runs the skill directly; after plain text, "as a separate word
 * with no punctuation attached", it only counts as the user's permission for that message. The
 * reader finds the words; whether a skill of that name exists, and may run (`checkInvocation`), is
 * the host's next step.
 */

export type SkillMention =
  | { readonly how: 'direct'; readonly command: string; readonly arguments: string }
  | { readonly how: 'named'; readonly command: string };

/**
 * A word that is a skill name and nothing else: letters, digits, `_`, `-` and the plugin `:`. Any
 * other character in the word is "punctuation attached" (`/deploy,`, `/usr/bin`) and the word is
 * not a mention. Judgment: the docs give the rule, not the alphabet of a name.
 */
const NAME_WORD = /^[\p{L}\p{N}_:-]+$/u;
const WORD = /\S+/gu;

const nameOf = (word: string): string | undefined => {
  if (!word.startsWith('/')) return undefined;
  const name = word.slice(1);
  return NAME_WORD.test(name) ? name : undefined;
};

export function readSkillMentions(message: string): SkillMention[] {
  const mentions: SkillMention[] = [];
  const seen = new Set<string>();
  const first = message.trimStart();
  const direct = nameOf(first.split(/\s/u, 1)[0] ?? '');
  if (direct !== undefined) {
    const rest = first.slice(direct.length + 1).trim();
    mentions.push({ how: 'direct', command: direct, arguments: rest });
    seen.add(direct);
  }
  for (const [word] of message.matchAll(WORD)) {
    const name = nameOf(word);
    if (name === undefined || seen.has(name)) continue;
    seen.add(name);
    mentions.push({ how: 'named', command: name });
  }
  return mentions;
}
