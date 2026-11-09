import { scanCommand, wordsOf } from '../bash/split.ts';
import { stripWrappers } from '../bash/wrappers.ts';
import { absolutePath } from '../path/posix.ts';
import type { PathContext } from '../types.ts';
import { redirectTargets, type Target } from './redirects.ts';
import { expandHome } from './scope.ts';
import { unquote } from './shell-words.ts';

/**
 * The files a Bash command names, as the `Read` and `Edit` rules see them (permissions.md, "What
 * `Read` and `Edit` rules cover": the rules apply "to file commands Claude Code recognizes in Bash,
 * such as `cat`, `head`, `tail`, `sed`, and `tee`, and to the targets of Bash redirections such as
 * `> file` and `< file`"; "a command that reads files without naming them" is not covered). A
 * lexical reading of the line, not a sandbox. Judgment (spec/judgments.md): the docs name five of
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
  readonly reads: readonly string[];
  readonly writes: readonly string[];
}

/** What a program does with the file operands it is given. */
type Role = (files: readonly string[], words: readonly string[]) => Operands;

const reads: Role = (files) => ({ reads: files, writes: [] });
const writes: Role = (files) => ({ reads: [], writes: files });
const copies: Role = (files) =>
  files.length < 2
    ? { reads: [], writes: [] }
    : { reads: files.slice(0, -1), writes: files.slice(-1) };
const edits: Role = (files, words) =>
  words.some((word) => word.startsWith('-i') || word === '--in-place')
    ? writes(files, words)
    : reads(files, words);

const READING = [
  'cat head tail less more bat nl wc sort uniq diff cmp xxd od hexdump strings file stat',
  'md5sum shasum sha256sum base64 source . jq yq awk cut tr column grep rg egrep fgrep',
].join(' ');
const WRITING = 'touch rm truncate chmod chown mkdir rmdir';
const COPYING = 'cp mv install ln rsync';

const rolesOf = (names: string, role: Role): [string, Role][] =>
  names.split(' ').map((name) => [name, role]);

/** `tee` is not here: the redirection reader already counts its files as writes. */
const PROGRAMS: ReadonlyMap<string, Role> = new Map([
  ...rolesOf(READING, reads),
  ...rolesOf(WRITING, writes),
  ...rolesOf(COPYING, copies),
  ...rolesOf('sed', edits),
]);

/** The first operand is a pattern or a program, not a file. */
const PATTERN_FIRST: ReadonlySet<string> = new Set(
  'grep rg egrep fgrep jq yq awk sed tr cut'.split(' '),
);

/** Which list a redirection's file goes in. */
const SIDE: { readonly [K in Target['kind']]: 'reads' | 'writes' } = {
  input: 'reads',
  output: 'writes',
};

const REDIRECT = /^\d*(?:>>?|<)(.*)$/;

/** The words that are file operands: not an option, not a redirection or the word it takes. */
function operandsOf(words: readonly string[]): string[] {
  const operands: string[] = [];
  for (let at = 1; at < words.length; at++) {
    const word = words[at] ?? '';
    const redirect = REDIRECT.exec(word);
    if (redirect !== null) at += redirect[1] === '' ? 1 : 0;
    else if (!word.startsWith('-')) operands.push(word);
  }
  return operands;
}

export function bashFileTargets(command: string, paths: PathContext): BashFileTargets {
  const found: { reads: string[]; writes: string[] } = { reads: [], writes: [] };
  const resolve = (text: string): string => absolutePath(expandHome(unquote(text), paths), paths);
  for (const target of redirectTargets(command)) {
    found[SIDE[target.kind]].push(resolve(target.text));
  }
  for (const subcommand of scanCommand(command).subcommands) {
    const words = wordsOf(stripWrappers(subcommand, 'deny')).map((word) => unquote(word.text));
    const program = words[0] ?? '';
    const role = PROGRAMS.get(program);
    if (role === undefined) continue;
    const operands = operandsOf(words);
    const files = PATTERN_FIRST.has(program) ? operands.slice(1) : operands;
    const named = role(files.map(resolve), words);
    found.reads.push(...named.reads);
    found.writes.push(...named.writes);
  }
  return found;
}
