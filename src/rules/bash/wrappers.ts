import type { PermissionBehavior } from '../../protocol/official.ts';
import { RESTRICTS } from '../restricts.ts';
import { assignedVariable, isSafeAssignment } from './safe-env.ts';
import { readCommand, type ShellCommand, type ShellWord } from './words.ts';

/**
 * The wrappers permissions.md ("Bash > Wrappers") says Claude Code strips before matching:
 * `timeout`, `time`, `nice`, `nohup` and `stdbuf`, the shell builtins `command` and `builtin`, zsh's
 * `noglob`, and bare `xargs`. "This wrapper list is built in and is not configurable."
 */
const WRAPPER_NAMES = [
  'timeout',
  'time',
  'nice',
  'nohup',
  'stdbuf',
  'command',
  'builtin',
  'noglob',
  'xargs',
] as const;

type WrapperName = (typeof WRAPPER_NAMES)[number];

/**
 * What stands between a wrapper and the command it runs. The docs give the list, not the options,
 * so each wrapper's own are the kit's reading of its manual (spec/judgments.md).
 */
interface WrapperSyntax {
  /** Options whose value is the next word (`timeout -s KILL`, `nice -n 5`). */
  readonly valueOptions: ReadonlySet<string>;
  /** Words after the options that are not the command (`timeout`'s duration). */
  readonly operands: number;
  /** An option the wrapper may carry; `false` for `xargs`, which is stripped only when bare. */
  readonly takesOptions: boolean;
  /** Options that turn the wrapper into something else: `command -v` looks a command up. */
  readonly querying: ReadonlySet<string>;
}

const none: ReadonlySet<string> = new Set();
const options = (...names: readonly string[]): ReadonlySet<string> => new Set(names);

const WRAPPERS: { readonly [W in WrapperName]: WrapperSyntax } = {
  timeout: {
    valueOptions: options('-s', '--signal', '-k', '--kill-after'),
    operands: 1,
    takesOptions: true,
    querying: none,
  },
  time: {
    valueOptions: options('-f', '--format', '-o', '--output'),
    operands: 0,
    takesOptions: true,
    querying: none,
  },
  nice: {
    valueOptions: options('-n', '--adjustment'),
    operands: 0,
    takesOptions: true,
    querying: none,
  },
  nohup: { valueOptions: none, operands: 0, takesOptions: true, querying: none },
  stdbuf: {
    valueOptions: options('-i', '-o', '-e', '--input', '--output', '--error'),
    operands: 0,
    takesOptions: true,
    querying: none,
  },
  command: { valueOptions: none, operands: 0, takesOptions: true, querying: options('-v', '-V') },
  builtin: { valueOptions: none, operands: 0, takesOptions: false, querying: none },
  noglob: { valueOptions: none, operands: 0, takesOptions: false, querying: none },
  xargs: { valueOptions: none, operands: 0, takesOptions: false, querying: none },
};

/** No variable beyond the known-safe ones (`safe-env.ts`): what a host adds is its own. */
const NO_HOST_VARIABLES: ReadonlySet<string> = new Set();

const isWrapper = (name: string | undefined): name is WrapperName =>
  name !== undefined && Object.hasOwn(WRAPPERS, name);

/** Index of the command a wrapper at `words[from]` runs, or `undefined` when it runs none. */
function commandIndex(
  words: readonly ShellWord[],
  from: number,
  syntax: WrapperSyntax,
): number | undefined {
  let index = from + 1;
  while (words[index]?.value.startsWith('-') === true) {
    const option = words[index]?.value ?? '';
    if (option === '--') {
      index += 1;
      break;
    }
    if (!syntax.takesOptions || syntax.querying.has(option)) return undefined;
    index += syntax.valueOptions.has(option) ? 2 : 1;
  }
  index += syntax.operands;
  return index < words.length ? index : undefined;
}

/**
 * The index after one leading assignment or wrapper at `from`, or `undefined` when there is
 * neither. "An allow rule won't match past an assignment of any other variable. A deny or ask rule
 * matches past any leading assignment" (`RESTRICTS`).
 */
function stripStep(
  words: readonly ShellWord[],
  from: number,
  behavior: PermissionBehavior,
  safeEnv: ReadonlySet<string>,
): number | undefined {
  const first = words[from];
  if (first === undefined) return undefined;
  if (assignedVariable(first) !== undefined) {
    const strips = RESTRICTS[behavior] || isSafeAssignment(first, safeEnv);
    return strips && words[from + 1] !== undefined ? from + 1 : undefined;
  }
  // A quoted wrapper name runs the wrapper all the same (src/rules/bash/unquote.ts).
  return isWrapper(first.value) ? commandIndex(words, from, WRAPPERS[first.value]) : undefined;
}

/**
 * Where each form of a command starts among its words: at its first word, then after each wrapper
 * or assignment is removed in turn, so `timeout 5 nohup npm test` is also `nohup npm test` and `npm
 * test`.
 */
export function formStarts(
  words: readonly ShellWord[],
  behavior: PermissionBehavior,
  safeEnv: ReadonlySet<string> = NO_HOST_VARIABLES,
): readonly number[] {
  const starts = [0];
  for (
    let next = stripStep(words, 0, behavior, safeEnv);
    next !== undefined;
    next = stripStep(words, next, behavior, safeEnv)
  ) {
    starts.push(next);
  }
  return starts;
}

/** The words of the command a subcommand runs once every leading wrapper and assignment is removed. */
export function strippedWords(
  command: ShellCommand,
  behavior: PermissionBehavior,
  safeEnv: ReadonlySet<string> = NO_HOST_VARIABLES,
): readonly ShellWord[] {
  return command.words.slice(formStarts(command.words, behavior, safeEnv).at(-1) ?? 0);
}

/** The command a subcommand runs once every leading wrapper and assignment is removed, as written. */
export function stripWrappers(
  subcommand: string,
  behavior: PermissionBehavior,
  safeEnv: ReadonlySet<string> = NO_HOST_VARIABLES,
): string {
  const command = readCommand(subcommand);
  const first = strippedWords(command, behavior, safeEnv)[0];
  return first === undefined || first === command.words[0]
    ? subcommand
    : subcommand.slice(first.start);
}

/**
 * What the read-only set sees through, in the order Claude Code accepts them (oracle 2.1.322):
 * known-safe assignments, then `noglob`, then `command` (`-p`, `--`) or `builtin`, then `timeout`
 * with a bare duration. A later stage never comes before an earlier one (`timeout 5 command ls`,
 * `command LANG=C ls` and `command noglob ls` were asked), and nothing else is stripped: `nice`,
 * `time`, `nohup`, `stdbuf`, `xargs` and any `timeout` option were asked (spec/judgments.md).
 */
const READ_ONLY_STAGES: readonly ((
  words: readonly ShellWord[],
  at: number,
) => number | undefined)[] = [
  (words, at) => {
    const word = words[at];
    return word !== undefined && isSafeAssignment(word) ? at + 1 : undefined;
  },
  (words, at) => (words[at]?.value === 'noglob' ? at + 1 : undefined),
  (words, at) => {
    const name = words[at]?.value;
    if (name === 'builtin') return at + 1;
    if (name !== 'command') return undefined;
    let next = at + 1;
    while (words[next]?.value === '-p' || words[next]?.value === '--') next += 1;
    return words[next]?.value.startsWith('-') === true ? undefined : next;
  },
  (words, at) =>
    words[at]?.value === 'timeout' && DURATION.test(words[at + 1]?.value ?? '')
      ? at + 2
      : undefined,
];

const DURATION = /^\d+(?:\.\d+)?[smhd]?$/;

/**
 * The words of the command the read-only set judges once the wrappers it sees through are removed
 * (`READ_ONLY_STAGES`), and whether any was: `git` and `cd` behind one are not read-only.
 */
export function readOnlyWords(words: readonly ShellWord[]): {
  readonly words: readonly ShellWord[];
  readonly stripped: boolean;
} {
  let at = 0;
  let stage = 0;
  while (stage < READ_ONLY_STAGES.length) {
    const next = READ_ONLY_STAGES[stage]?.(words, at);
    if (next === undefined || next >= words.length) stage += 1;
    else at = next;
  }
  return { words: words.slice(at), stripped: at > 0 };
}
