/**
 * The text a `prompt` or `agent` hook sends (hooks.md, "Prompt and agent hook fields" and "Prompt
 * hook configuration"): "Use `$ARGUMENTS` as a placeholder for the hook input JSON. Escape with a
 * backslash to include literal text: `\$1.00` renders as `$1.00`", and "If `$ARGUMENTS` is not
 * present, input JSON is appended to the prompt".
 */

/** An escaped dollar sign, or the placeholder. The escape comes first, so `\$ARGUMENTS` is text. */
const TOKEN = /\\\$|\$ARGUMENTS/g;
const ESCAPED = '\\$';
const PLACEHOLDER = '$ARGUMENTS';

/** Judgment (spec/judgments.md): the input is appended after a blank line. */
const APPEND_SEPARATOR = '\n\n';

/**
 * The prompt with every `$ARGUMENTS` replaced by `inputJson` and every `\$` by `$`, in one pass so
 * the input JSON is never unescaped or searched for the placeholder again; the input alone is
 * appended when the prompt has no placeholder.
 */
export function composePrompt(prompt: string, inputJson: string): string {
  const hasPlaceholder = [...prompt.matchAll(TOKEN)].some(([token]) => token === PLACEHOLDER);
  const text = prompt.replace(TOKEN, (token) => (token === ESCAPED ? '$' : inputJson));
  return hasPlaceholder ? text : `${text}${APPEND_SEPARATOR}${inputJson}`;
}
