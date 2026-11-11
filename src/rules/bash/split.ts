import { memoize } from '../memo.ts';
import { BASH_DIALECT, POWERSHELL_DIALECT, type ShellDialect } from './dialect.ts';
import { newScan, readList, type Span } from './scanner.ts';
import { readCommand, type ShellCommand } from './words.ts';

/** The subcommands a command line runs, and whether the kit could read it all. */
export interface SplitCommand {
  /** In reading order, a command before the ones nested in it; best effort when not parseable. */
  readonly subcommands: readonly string[];
  /** False for a command with nothing after `&&` or `||`, or an unclosed quote or bracket. */
  readonly parseable: boolean;
}

/**
 * Everything the kit reads from one command line, read once per line (`scanCommand`) and shared by
 * the rule matchers, the read-only and `acceptEdits` checks, the redirect checks, the critical-path
 * check, the file targets and the hook `if` filter.
 */
export interface CommandScan extends SplitCommand {
  /** Each subcommand read into its words and redirections, in the order of `subcommands`. */
  readonly commands: readonly ShellCommand[];
  /** The whole line read as one command: what a deny or ask rule tries when the line is unparseable. */
  readonly whole: ShellCommand;
  /**
   * `$(`, a backtick (Bash), `${` or `$NAME` outside single quotes and not escaped: the command may
   * run something its text does not show.
   */
  readonly substitutes: boolean;
  /** A subshell, a command or process substitution, or an arithmetic expansion. */
  readonly nests: boolean;
  /** The functions the line defines (`f() { ... }`, `function f`): a later `f` runs their body. */
  readonly functions: readonly string[];
  /** Where the comments are (cut from the subcommands). */
  readonly comments: readonly Span[];
  /** Where the here-document bodies are (text, not commands). */
  readonly heredocs: readonly Span[];
}

function scanText(src: string, dialect: ShellDialect): CommandScan {
  const scan = newScan(src, dialect, 0);
  readList(scan, undefined);
  const commands = scan.subs.map((sub) => readCommand(sub, dialect));
  // `echo >` with nothing to redirect to is a syntax error, so the line is not read.
  const complete = commands.every((command) =>
    command.redirects.every((redirect) => redirect.target !== undefined),
  );
  return {
    subcommands: scan.subs,
    parseable: scan.ok && complete,
    commands,
    whole: readCommand(src.trim(), dialect),
    substitutes: scan.substitutes,
    nests: scan.nests,
    functions: scan.functions,
    comments: scan.comments,
    heredocs: scan.bodies,
  };
}

const SCANS: ReadonlyMap<ShellDialect, (command: string) => CommandScan> = new Map([
  [BASH_DIALECT, memoize((command) => scanText(command, BASH_DIALECT), 64)],
  [POWERSHELL_DIALECT, memoize((command) => scanText(command, POWERSHELL_DIALECT), 64)],
]);

/**
 * The reading of a command line (`CommandScan`), remembered for the last lines read so every check
 * of one call shares it.
 */
export function scanCommand(command: string, dialect: ShellDialect = BASH_DIALECT): CommandScan {
  return SCANS.get(dialect)?.(command) ?? scanText(command, dialect);
}

/**
 * Splits a command line into the commands it runs (permissions.md, "Compound commands"): at every
 * separator outside quotes and comments, and again inside `$()`, backticks, subshells, function
 * bodies, unquoted here-document bodies and control-flow bodies, so a rule sees a command nested in
 * another. The text of each subcommand is as written, comments cut. A command the kit cannot read
 * to the end is `parseable: false`, with the subcommands found so far.
 */
export function splitCommand(command: string, dialect: ShellDialect = BASH_DIALECT): SplitCommand {
  const { subcommands, parseable } = scanCommand(command, dialect);
  return { subcommands, parseable };
}
