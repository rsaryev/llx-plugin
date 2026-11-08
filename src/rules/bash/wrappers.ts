import type { PermissionBehavior } from '../../protocol/official.ts';
import { wordsOf, type Word } from './split.ts';

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

/**
 * "Certain known-safe environment variables": the docs name `NODE_ENV`, `LANG` and `NO_COLOR` and
 * no more, so those three are the seed; a host adds its own through `MatchContext.safeEnvVars`.
 */
export const SAFE_ENVIRONMENT_VARIABLES: ReadonlySet<string> = new Set([
  'NODE_ENV',
  'LANG',
  'NO_COLOR',
]);

/**
 * Whether a leading `VAR=value` is stripped. "An allow rule won't match past an assignment of any
 * other variable. A deny or ask rule matches past any leading assignment."
 */
const STRIPS_ANY_ASSIGNMENT: { readonly [B in PermissionBehavior]: boolean } = {
  allow: false,
  deny: true,
  ask: true,
};

const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=/;

const isWrapper = (name: string | undefined): name is WrapperName =>
  name !== undefined && Object.hasOwn(WRAPPERS, name);

/** Index of the command a wrapper at `words[0]` runs, or `undefined` when it runs none. */
function commandIndex(words: readonly Word[], syntax: WrapperSyntax): number | undefined {
  let index = 1;
  while (words[index]?.text.startsWith('-') === true) {
    const option = words[index]?.text ?? '';
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

/** The text after one leading assignment or wrapper, or `undefined` when there is neither. */
function stripStep(
  command: string,
  behavior: PermissionBehavior,
  safeEnv: ReadonlySet<string>,
): string | undefined {
  const words = wordsOf(command);
  const first = words[0];
  if (first === undefined) return undefined;
  const variable = ASSIGNMENT.exec(first.text)?.[1];
  if (variable !== undefined) {
    const strips = STRIPS_ANY_ASSIGNMENT[behavior] || safeEnv.has(variable);
    return strips && words[1] !== undefined ? command.slice(words[1].start) : undefined;
  }
  if (!isWrapper(first.text)) return undefined;
  const index = commandIndex(words, WRAPPERS[first.text]);
  const next = index === undefined ? undefined : words[index];
  return next === undefined ? undefined : command.slice(next.start);
}

/**
 * Every form of a subcommand a rule may match: as written, then after each wrapper or assignment
 * is removed in turn, so `timeout 5 nohup npm test` is also `nohup npm test` and `npm test`.
 */
export function strippedForms(
  subcommand: string,
  behavior: PermissionBehavior,
  safeEnv: ReadonlySet<string> = SAFE_ENVIRONMENT_VARIABLES,
): readonly string[] {
  const forms = [subcommand];
  for (
    let next = stripStep(subcommand, behavior, safeEnv);
    next !== undefined;
    next = stripStep(next, behavior, safeEnv)
  ) {
    forms.push(next);
  }
  return forms;
}

/** The command a subcommand runs once every leading wrapper and assignment is removed. */
export function stripWrappers(
  subcommand: string,
  behavior: PermissionBehavior,
  safeEnv: ReadonlySet<string> = SAFE_ENVIRONMENT_VARIABLES,
): string {
  return strippedForms(subcommand, behavior, safeEnv).at(-1) ?? subcommand;
}
