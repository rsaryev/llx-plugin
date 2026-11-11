/**
 * The unquoted-placeholder warning of `claude plugin validate` on a shell-form hook command (oracle
 * 2.1.319; the changelog's "leaves `${CLAUDE_PLUGIN_ROOT}` unquoted (it breaks on plugin paths with
 * spaces)"). The validator reads three placeholders; a use inside single or double quotes is fine.
 */
const PLACEHOLDERS = ['CLAUDE_PLUGIN_DATA', 'CLAUDE_PLUGIN_ROOT', 'CLAUDE_PROJECT_DIR'] as const;
const NAMES = PLACEHOLDERS.join('|');
const USE = new RegExp(`^\\$(?:\\{(${NAMES})\\}|(${NAMES})(?![A-Za-z0-9_]))`);

type Quote = '' | "'" | '"';

/** The quote state after one character: `\` escapes outside single quotes, a quote toggles its own kind. */
function advance(state: Quote, char: string): Quote {
  if (state === '' && (char === "'" || char === '"')) return char;
  return state === char ? '' : state;
}

/** The placeholders a command uses outside any quotes, sorted and without repeats. */
function unquotedPlaceholders(command: string): string[] {
  const found = new Set<string>();
  let state: Quote = '';
  for (let index = 0; index < command.length; index += 1) {
    const char = command.charAt(index);
    if (char === '\\' && state !== "'") {
      index += 1;
      continue;
    }
    if (state === '' && char === '$') {
      const use = USE.exec(command.slice(index));
      const name = use?.[1] ?? use?.[2];
      if (name !== undefined) found.add(name);
    }
    state = advance(state, char);
  }
  return [...found].toSorted();
}

const ADVICE =
  'If the expanded path contains a space the command can split into several words and fail. Wrap the placeholder in double quotes, or use exec form: {"command": "<executable>", "args": ["${CLAUDE_PLUGIN_ROOT}/..."]}.';

/** The warning's text, or `undefined` when every placeholder is quoted. */
export function unquotedMessage(command: string): string | undefined {
  const names = unquotedPlaceholders(command);
  if (names.length === 0) return undefined;
  const list = names.map((name) => `\${${name}}`).join(', ');
  return `Shell command uses ${list} without quotes: ${command}. ${ADVICE}`;
}
