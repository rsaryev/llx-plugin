import { scanCommand } from '../bash/split.ts';
import type { ShellWord } from '../bash/words.ts';
import { strippedWords } from '../bash/wrappers.ts';
import type { PathContext } from '../types.ts';
import { literalOf, redirectTargets, type Target } from './redirects.ts';

/**
 * The files a Bash command names, as the `Read` and `Edit` rules see them (permissions.md, "What
 * `Read` and `Edit` rules cover": the rules apply "to file commands Claude Code recognizes in Bash,
 * such as `cat`, `head`, `tail`, `sed`, and `tee`, and to the targets of Bash redirections such as
 * `> file` and `< file`"; "a command that reads files without naming them" is not covered). A
 * lexical reading of the line, not a sandbox; an operand a variable or substitution hides is left
 * out. Judgment (spec/judgments.md): the docs name five of
 * the commands, so the set below is the kit's, and a `cd` earlier in the line does not move the
 * directory later operands are read against.
 */
export interface BashFileTargets {
  /** Absolute POSIX paths the command reads. */
  readonly reads: readonly string[];
  /** Absolute POSIX paths the command writes. */
  readonly writes: readonly string[];
}

interface Operands {
  readonly reads: readonly ShellWord[];
  readonly writes: readonly ShellWord[];
}

/** What a program does with the file operands it is given. */
type Role = (files: readonly ShellWord[], args: readonly ShellWord[]) => Operands;

const reads: Role = (files) => ({ reads: files, writes: [] });
const writes: Role = (files) => ({ reads: [], writes: files });
const copies: Role = (files) =>
  files.length < 2
    ? { reads: [], writes: [] }
    : { reads: files.slice(0, -1), writes: files.slice(-1) };
const edits: Role = (files, args) =>
  args.some((word) => word.value.startsWith('-i') || word.value.startsWith('--in-place'))
    ? writes(files, args)
    : reads(files, args);

/**
 * The file commands Claude Code 2.1.322 path-checked: a file they name outside the working
 * directories was asked despite a prefix rule (spec/judgments.md).
 */
const READING = [
  'cat head tail nl wc sort uniq diff cmp od hexdump strings file stat md5sum sha256sum base64',
  'jq awk cut tr column grep rg egrep fgrep ls find tac rev fold paste comm expand',
].join(' ');
const WRITING = 'touch rm mkdir rmdir';
const COPYING = 'cp mv';
/**
 * Commands that name files Claude Code ran outside the working directories under their prefix rule,
 * with no path check: the kit applies `Read` and `Edit` deny and ask rules to them all the same
 * (docs/SECURITY.md), and nothing else.
 */
const UNCHECKED_READING = 'less more bat xxd shasum source . yq du';
const UNCHECKED_WRITING = 'truncate chmod chown';
const UNCHECKED_COPYING = 'install ln rsync';

interface Program {
  readonly role: Role;
  /** Claude Code checks the paths it names against the working directories. */
  readonly checked: boolean;
}

const programsOf = (names: string, role: Role, checked: boolean): [string, Program][] =>
  names.split(' ').map((name) => [name, { role, checked }]);

/** `tee` is not here: the redirection reader already counts its files as writes. */
const PROGRAMS: ReadonlyMap<string, Program> = new Map([
  ...programsOf(READING, reads, true),
  ...programsOf(WRITING, writes, true),
  ...programsOf(COPYING, copies, true),
  ...programsOf('sed', edits, true),
  ...programsOf(UNCHECKED_READING, reads, false),
  ...programsOf(UNCHECKED_WRITING, writes, false),
  ...programsOf(UNCHECKED_COPYING, copies, false),
]);

/** The first operand is a pattern or a program, not a file, unless an option gave it. */
const PATTERN_FIRST: ReadonlySet<string> = new Set(
  'grep rg egrep fgrep jq yq awk sed tr cut'.split(' '),
);
const PATTERN_OPTIONS: ReadonlySet<string> = new Set(['-e', '--regexp', '--expression']);
const GIVES_PATTERN = /^(?:-[A-Za-z]*[ef].*|--(?:regexp|file|expression|from-file)(?:=.*)?)$/s;

/**
 * The files one command, its wrappers taken off, reads and writes by naming them; `undefined` for a
 * program the kit does not know as a file command. The read-only and read-block checks read the
 * same operands (`shell-commands.ts`).
 */
export function fileOperands(
  words: readonly ShellWord[],
): (Operands & { readonly checked: boolean }) | undefined {
  const [program, ...args] = words;
  const known = PROGRAMS.get(program?.value ?? '');
  if (program === undefined || known === undefined) return undefined;
  // The script or pattern of `-e` and its long forms is the next word, not a file.
  const operands = args.filter(
    (word, at) => !word.value.startsWith('-') && !PATTERN_OPTIONS.has(args[at - 1]?.value ?? ''),
  );
  const patternFirst =
    PATTERN_FIRST.has(program.value) && !args.some((word) => GIVES_PATTERN.test(word.value));
  return {
    ...known.role(patternFirst ? operands.slice(1) : operands, args),
    checked: known.checked,
  };
}

/** Which list a target's file goes in. */
const SIDE: { readonly [K in Target['kind']]: Side } = {
  input: 'reads',
  output: 'writes',
};

/**
 * Every file a Bash command names or redirects to, in the order it runs: redirections and `tee`
 * (`redirectTargets`), then the operands of the file commands, read against the starting directory.
 */
export function commandTargets(command: string): readonly Target[] {
  const named = scanCommand(command).commands.flatMap((subcommand) => {
    const operands = fileOperands(strippedWords(subcommand, 'deny'));
    if (operands === undefined) return [];
    const source = operands.checked ? 'operand' : 'unchecked';
    const of =
      (kind: Target['kind']) =>
      (word: ShellWord): Target => ({ word, kind, afterCd: false, source });
    return [...operands.reads.map(of('input')), ...operands.writes.map(of('output'))];
  });
  return [...redirectTargets(command), ...named];
}

export function bashFileTargets(command: string, paths: PathContext): BashFileTargets {
  const found: { [S in Side]: string[] } = { reads: [], writes: [] };
  for (const target of commandTargets(command)) {
    const literal = literalOf(target.word, paths);
    if (literal !== undefined) found[SIDE[target.kind]].push(literal);
  }
  return found;
}

type Side = 'reads' | 'writes';
