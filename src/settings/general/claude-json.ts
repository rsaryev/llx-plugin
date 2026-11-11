import { error, type PluginIssue } from '../../format/issues.ts';

/**
 * What the host must do with the text of `~/.claude.json`, the file Claude Code writes for itself
 * (settings.md, "Fix a broken settings file"; errors.md, "Configuration error in ~/.claude.json" and
 * "Claude configuration file was empty and no backup holds anything"). It is no settings file and no
 * layer: the kit only decides, the host reads, copies and prints.
 */
export interface ClaudeJsonFacts {
  /** The file's text; `undefined` when there is no file (Claude Code then starts with defaults). */
  readonly text: string | undefined;
  /** Where the file is, as the host writes it, for the messages. */
  readonly path: string;
  /** The `.claude.json.backup.<timestamp>` file that holds something, when there is one. */
  readonly backup?: string;
  /** The file the broken copy goes to: `~/.claude/backups/.claude.json.corrupted.<timestamp>`. */
  readonly corruptedCopy: string;
  /** An interactive session asks; a non-interactive start such as `claude -p` exits. */
  readonly interactive: boolean;
}

export type ClaudeJsonOutcome =
  /** The file parses, or there is none: nothing to report. */
  | { readonly outcome: 'usable' }
  /** Blank and no backup holds anything: start with defaults and print `message`. */
  | { readonly outcome: 'starts-with-defaults'; readonly message: string }
  /** Unparseable: the file is left unchanged, copied to `copyTo`, and `then` follows. */
  | {
      readonly outcome: 'configuration-error';
      readonly issue: PluginIssue;
      readonly output: readonly string[];
      readonly copyTo: string;
      /** `exit`: a non-interactive start exits with code 1; `ask`: an interactive one asks whether to exit and fix or reset to the default configuration. */
      readonly afterwards: 'exit' | 'ask';
    };

const parseFailure = (text: string): string | undefined => {
  try {
    JSON.parse(text);
    return undefined;
  } catch (failure) {
    return failure instanceof Error ? failure.message : 'invalid JSON';
  }
};

/** The lines Claude Code prints for a corrupted file, the backup's `cp` line only when a backup holds something. */
function outputOf(facts: ClaudeJsonFacts, reason: string): readonly string[] {
  const restore =
    facts.backup === undefined
      ? []
      : [
          `A backup file exists at: ${facts.backup}`,
          `You can manually restore it by running: cp -f "${facts.backup}" "${facts.path}"`,
        ];
  return [
    `Claude configuration file at ${facts.path} is corrupted: ${reason}`,
    `The corrupted file has been backed up to: ${facts.corruptedCopy}`,
    ...restore,
    '',
    `Configuration error in ${facts.path}: ${reason}`,
  ];
}

export function readClaudeJson(facts: ClaudeJsonFacts): ClaudeJsonOutcome {
  const { text } = facts;
  if (text === undefined) return { outcome: 'usable' };
  if (text.trim() === '' && facts.backup === undefined) {
    return {
      outcome: 'starts-with-defaults',
      message: `Claude configuration file at ${facts.path} was empty and no backup holds anything: starting with defaults.`,
    };
  }
  const reason = text.trim() === '' ? 'Unexpected end of JSON input' : parseFailure(text);
  if (reason === undefined) return { outcome: 'usable' };
  return {
    outcome: 'configuration-error',
    issue: error(facts.path, `Configuration error in ${facts.path}: ${reason}`),
    output: outputOf(facts, reason),
    copyTo: facts.corruptedCopy,
    afterwards: facts.interactive ? 'ask' : 'exit',
  };
}
