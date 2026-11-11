import type { SkillShell } from '../format/skill-types.ts';
import { rewriteArguments, type ArgumentInput, type Insert } from './substitute.ts';
import { parseArguments } from './arguments.ts';

/**
 * How a `!` command receives the invocation's arguments (skills.md, "Available string
 * substitutions"; docs/SECURITY.md, "`$ARGUMENTS` in `!` blocks"). Judgment (spec/judgments.md,
 * `shellArguments`): `pasted`, the default, writes each value into the command as Claude Code does;
 * `environment-reference` gives a bash command each placeholder as a reference to a variable that
 * holds the value, so the shell never parses a value as code, whatever quoting the author put
 * around the placeholder. The permission check reads the command with each value quoted where it
 * lands. PowerShell keeps the values pasted.
 */
export type ShellArguments = 'pasted' | 'environment-reference';

/** A `!` command with its arguments bound: what is checked, what the shell runs, and its variables. */
export interface BoundArguments {
  readonly checked: string;
  readonly shell: string;
  readonly environment: Readonly<Record<string, string>>;
}

/** Whether the host's choice binds the arguments of a command for this shell. */
const BINDS: { readonly [A in ShellArguments]: { readonly [S in SkillShell]: boolean } } = {
  pasted: { bash: false, powershell: false },
  'environment-reference': { bash: true, powershell: false },
};

export const bindsArguments = (choice: ShellArguments | undefined, shell: SkillShell): boolean =>
  BINDS[choice ?? 'pasted'][shell];

type Quoting = 'none' | 'single' | 'double';

/** The quoting after a character: a quote opens or closes its own kind, and only outside the other. */
const NEXT: { readonly [Q in Quoting]: Readonly<Record<string, Quoting>> } = {
  none: { "'": 'single', '"': 'double' },
  single: { "'": 'none' },
  double: { '"': 'none' },
};

/** Whether a backslash escapes the next character: everywhere but in single quotes. */
const ESCAPES: { readonly [Q in Quoting]: boolean } = { none: true, single: false, double: true };

/** The quoting each `$` of a POSIX command sits in. */
function quotingOfDollars(command: string): ReadonlyMap<number, Quoting> {
  const found = new Map<number, Quoting>();
  let quoting: Quoting = 'none';
  for (let at = 0; at < command.length; at += 1) {
    const char = command.charAt(at);
    if (char === '$') found.set(at, quoting);
    if (char === '\\' && ESCAPES[quoting]) at += 1;
    else quoting = NEXT[quoting][char] ?? quoting;
  }
  return found;
}

/** A reference that reads as one value in the quoting it lands in. */
const REFERENCE: { readonly [Q in Quoting]: (name: string) => string } = {
  none: (name) => `"\${${name}}"`,
  double: (name) => `\${${name}}`,
  // Close the author's single quote, expand in double quotes, reopen it.
  single: (name) => `'"\${${name}}"'`,
};

const BARE = /^[A-Za-z0-9_@%+=:,./-]+$/;
const quoteWord = (value: string): string =>
  BARE.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;

/** The value as the shell would read it in the quoting it lands in: what a rule checks. */
const LITERAL: { readonly [Q in Quoting]: (value: string) => string } = {
  none: quoteWord,
  double: (value) => value.replace(/[\\"$`]/g, '\\$&'),
  single: (value) => value.replaceAll("'", `'\\''`),
};

const WHOLE = 'SKILL_ARGUMENTS';
const argumentVariable = (index: number): string => `SKILL_ARGUMENT_${index}`;

/**
 * `command`'s argument placeholders bound: an unquoted `$ARGUMENTS` is each argument as its own
 * word (the typed quoting groups words), in quotes the text as typed; `$N`, `$ARGUMENTS[N]` and a
 * declared `$name` are one argument. Escapes and unmatched placeholders are as `substituteArguments`
 * leaves them.
 */
export function bindShellArguments(command: string, input: ArgumentInput): BoundArguments {
  const quoting = quotingOfDollars(command);
  const words = parseArguments(input.rawArguments);
  const environment: Record<string, string> = {};
  // A control character never reaches here: the checked text holding it is refused (`shell-run.ts`).
  const name = (variable: string, value: string): string => {
    environment[variable] = value;
    return variable;
  };
  const quotingAt = (at: number): Quoting => quoting.get(at) ?? 'none';
  const reference: Insert = (placeholder, at) => {
    const where = quotingAt(at);
    if (placeholder.index !== undefined)
      return REFERENCE[where](name(argumentVariable(placeholder.index), placeholder.value));
    if (where !== 'none') return REFERENCE[where](name(WHOLE, placeholder.value));
    return words
      .map((word, index) => REFERENCE.none(name(argumentVariable(index), word)))
      .join(' ');
  };
  const literal: Insert = (placeholder, at) => {
    const where = quotingAt(at);
    const whole = placeholder.index === undefined && where === 'none';
    return whole ? words.map(quoteWord).join(' ') : LITERAL[where](placeholder.value);
  };
  return {
    shell: rewriteArguments(command, input, reference),
    checked: rewriteArguments(command, input, literal),
    environment,
  };
}
