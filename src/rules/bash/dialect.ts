/**
 * How a shell writes what the splitter has to tell apart. Bash and PowerShell differ in their
 * separators, their escape character and what a backtick is, so each is data here and the one
 * scanner (`split.ts`) reads it.
 */
export interface ShellDialect {
  /** The command separators, longest first (permissions.md, "Compound commands" and "PowerShell"). */
  readonly separators: readonly string[];
  /** The separators after which the command goes on, so one with nothing after it is unparseable. */
  readonly chains: readonly string[];
  /** The character that makes the next one literal. */
  readonly escape: string;
  /** A backtick opens a command substitution (Bash) rather than escaping a character (PowerShell). */
  readonly backtickSubstitutes: boolean;
  /** `{ ... }` holds commands of its own (a PowerShell script block). */
  readonly bracesHoldCommands: boolean;
  /** `do`, `then`, `done`, `for ...` and the like are shell keywords, not commands. */
  readonly hasKeywords: boolean;
  /** `<# ... #>` is a block comment (PowerShell); a `#` that starts a word comments out its line in both. */
  readonly blockComments: boolean;
}

/** permissions.md, "Compound commands": `&&`, `||`, `;`, `|`, `|&`, `&` and newlines. */
export const BASH_DIALECT: ShellDialect = {
  separators: ['&&', '||', '|&', ';', '|', '&', '\n'],
  chains: ['&&', '||'],
  escape: '\\',
  backtickSubstitutes: true,
  bracesHoldCommands: false,
  hasKeywords: true,
  blockComments: false,
};

/**
 * permissions.md, "PowerShell": `|`, `;` and on PowerShell 7+ `&&` and `||` split a compound
 * command. `&` is the call operator there, and the backtick is the escape character.
 */
export const POWERSHELL_DIALECT: ShellDialect = {
  separators: ['&&', '||', ';', '|', '\n'],
  chains: ['&&', '||'],
  escape: '`',
  backtickSubstitutes: false,
  bracesHoldCommands: true,
  hasKeywords: false,
  blockComments: true,
};
