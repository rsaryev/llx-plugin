/**
 * Shell keywords that stand where a command would: they start a body (`do`, `then`, `{`) or a
 * condition (`if`, `while`, `until`, `!`), and a rule sees the command after them. permissions.md
 * ("Compound commands") names "a control-flow body such as a `for` loop"; the keyword list is the
 * kit's own (spec/judgments.md). `case x in` and a pattern label such as `a)` or `*)` stand before
 * the command of a `case` body in the same way.
 */
const LEADING = /^(?:do|then|else|if|elif|while|until|!|\{|case\s.*?\sin|\(?[^\s()]+\))(?:\s+|$)/s;

/** Keywords that end a block, and the headers that only name what a loop or case ranges over. */
const STRUCTURE = /^(?:done|fi|esac|\}|(?:for|select)(?:\s.*)?)$/s;

/**
 * The command a segment holds once its leading keywords are removed, or `undefined` when the
 * segment is only structure (`done`, `fi`, `for f in a b`, an empty body).
 */
export function stripKeywords(segment: string): string | undefined {
  let text = segment;
  for (let match = LEADING.exec(text); match !== null; match = LEADING.exec(text)) {
    text = text.slice(match[0].length);
  }
  const command = text.trim();
  return command === '' || STRUCTURE.test(command) ? undefined : command;
}
