/**
 * Shell keywords that stand where a command would: they start a body (`do`, `then`, `{`) or a
 * condition (`if`, `while`, `until`, `!`), and a rule sees the command after them. permissions.md
 * ("Compound commands") names "a control-flow body such as a `for` loop"; the keyword list is the
 * kit's own (spec/judgments.md). `case x in` and a pattern label such as `a)` or `*)` stand before
 * the command of a `case` body in the same way.
 */
const LEADING = /^(?:do|then|else|if|elif|while|until|!|\{|case\s.*?\sin|\(?[^\s()]+\))(?:\s+|$)/s;

/**
 * A function definition's head, `name()` or `function name` (bash(1), "Shell Function
 * Definitions"): the command after it is the function's body, which a rule sees like any other.
 */
const FUNCTION_HEAD =
  /^(?:function\s+([^\s()]+)(?:\s*\(\s*\))?|([^\s()=$'"`]+)\s*\(\s*\))(?:\s+|$)/s;

/** Keywords that end a block, and the headers that only name what a loop or case ranges over. */
const STRUCTURE = /^(?:done|fi|esac|\}|(?:for|select)(?:\s.*)?)$/s;

/**
 * The command a segment holds once its leading keywords and function heads are removed, or
 * `undefined` when the segment is only structure (`done`, `fi`, `for f in a b`, an empty body). The
 * name of each function the segment defines is pushed to `defined`.
 */
export function stripKeywords(segment: string, defined: string[]): string | undefined {
  let text = segment;
  for (;;) {
    const head = FUNCTION_HEAD.exec(text);
    if (head !== null) defined.push(head[1] ?? head[2] ?? '');
    const match = head ?? LEADING.exec(text);
    if (match === null) break;
    text = text.slice(match[0].length);
  }
  const command = text.trim();
  return command === '' || STRUCTURE.test(command) ? undefined : command;
}
