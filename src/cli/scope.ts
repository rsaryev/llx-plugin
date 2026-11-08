import type { InstallScope } from '../marketplace/install-scopes.ts';
import { SCOPE_RANK } from '../settings/layers.ts';
import { usageError, type UsageError } from './result.ts';

/**
 * The scope grammar of the plugin commands (plugins/cli-reference.md, "claude plugin commands":
 * "`--scope` takes `user`, `project`, or `local`, and names the settings file the command writes
 * to. `update` also takes `managed`"; each command's `--scope` row; "plugin enable"; "plugin
 * update", "Which scope the command updates"; "claude plugin marketplace commands": "their `--scope`
 * flag has no `-s` short form"). Pure: which scope a command works on from the flag and the scopes a
 * plugin is declared in; the host reads and writes the settings files.
 */

/** The values `--scope` takes on every command that takes it. */
export const CONFIG_SCOPES = ['user', 'project', 'local'] as const;
export type ConfigScope = (typeof CONFIG_SCOPES)[number];

/** `update` also takes `managed`, the one scope that can be updated but not installed to. */
export type CommandScope = InstallScope;

/** The commands that take `--scope`. */
export const SCOPED_COMMANDS = [
  'install',
  'uninstall',
  'enable',
  'disable',
  'update',
  'prune',
  'marketplace-add',
  'marketplace-remove',
] as const;
export type ScopedCommand = (typeof SCOPED_COMMANDS)[number];

/** What a command does when `--scope` is omitted. */
export type ScopeChoice =
  | { readonly scope: CommandScope }
  /** The scope is found from where the plugin is declared (`detectScope`). */
  | { readonly autoDetect: true }
  /** The command acts on every scope. */
  | { readonly allScopes: true };

interface ScopeRule {
  readonly accepts: readonly CommandScope[];
  readonly whenOmitted: ScopeChoice;
  /** The scopes auto-detect checks, in order; empty for a command that does not detect. */
  readonly detects: readonly CommandScope[];
  /** The marketplace commands' `--scope` has no `-s`. */
  readonly short: boolean;
}

const DEFAULT_USER: ScopeChoice = { scope: 'user' };
const AUTO: ScopeChoice = { autoDetect: true };
const LOCAL_PROJECT_USER: readonly CommandScope[] = ['local', 'project', 'user'];

/** The registry: a command added to `SCOPED_COMMANDS` fails the typecheck until it has a rule. */
const SCOPE_RULES: { readonly [C in ScopedCommand]: ScopeRule } = {
  install: { accepts: CONFIG_SCOPES, whenOmitted: DEFAULT_USER, detects: [], short: true },
  uninstall: { accepts: CONFIG_SCOPES, whenOmitted: DEFAULT_USER, detects: [], short: true },
  prune: { accepts: CONFIG_SCOPES, whenOmitted: DEFAULT_USER, detects: [], short: true },
  enable: {
    accepts: CONFIG_SCOPES,
    whenOmitted: AUTO,
    detects: LOCAL_PROJECT_USER,
    short: true,
  },
  disable: {
    accepts: CONFIG_SCOPES,
    whenOmitted: AUTO,
    detects: LOCAL_PROJECT_USER,
    short: true,
  },
  update: {
    accepts: [...CONFIG_SCOPES, 'managed'],
    whenOmitted: AUTO,
    detects: [...LOCAL_PROJECT_USER, 'managed'],
    short: true,
  },
  'marketplace-add': {
    accepts: CONFIG_SCOPES,
    whenOmitted: DEFAULT_USER,
    detects: [],
    short: false,
  },
  'marketplace-remove': {
    accepts: CONFIG_SCOPES,
    whenOmitted: { allScopes: true },
    detects: [],
    short: false,
  },
};

/** How the help spells the flag: `-s, --scope <scope>`, or `--scope <scope>` for a marketplace command. */
export const scopeFlagSpelling = (command: ScopedCommand): string =>
  SCOPE_RULES[command].short ? '-s, --scope <scope>' : '--scope <scope>';

const acceptedScope = (command: ScopedCommand, value: string): CommandScope | undefined =>
  SCOPE_RULES[command].accepts.find((scope) => scope === value);

/** The commands that write to one scope, `user` when `--scope` is omitted. */
export type DefaultedCommand = 'install' | 'uninstall' | 'prune' | 'marketplace-add';

/**
 * The scope `command` works on: the flag's value, or what the command does without it. A value the
 * command does not take is a usage error ("An invalid `--scope`": no result line, exit `1`, the
 * reason on stderr; the wording is the kit's, spec/judgments.md).
 */
export function chooseScope(
  command: DefaultedCommand,
  given: string | undefined,
): { readonly scope: ConfigScope } | UsageError;
export function chooseScope(
  command: ScopedCommand,
  given: string | undefined,
): ScopeChoice | UsageError;
export function chooseScope(
  command: ScopedCommand,
  given: string | undefined,
): ScopeChoice | UsageError {
  if (given === undefined) return SCOPE_RULES[command].whenOmitted;
  const scope = acceptedScope(command, given);
  if (scope !== undefined) return { scope };
  const accepted = SCOPE_RULES[command].accepts.join(', ');
  return usageError(`Invalid scope: ${given}. Use one of: ${accepted}`);
}

/**
 * The scope an omitted `--scope` resolves to: "the most specific scope it's installed at ... checking
 * local, project, user, then managed" (`update`); `enable` and `disable` check "local, project,
 * user" and use "the first scope that mentions the plugin". `undefined` when none does.
 */
export function detectScope(
  command: ScopedCommand,
  declaredAt: readonly CommandScope[],
): CommandScope | undefined {
  return SCOPE_RULES[command].detects.find((scope) => declaredAt.includes(scope));
}

export type ScopeWrite =
  | { readonly kind: 'write'; readonly scope: CommandScope }
  /** "Claude Code writes an override at the scope you passed." */
  | { readonly kind: 'override'; readonly scope: CommandScope }
  | { readonly kind: 'refused'; readonly message: string }
  | { readonly kind: 'not-installed' };

/**
 * `--scope` given to `enable` or `disable` for a plugin (plugins/cli-reference.md, "plugin enable"):
 * where the plugin is declared the scope is written; "a scope that takes precedence over the
 * declaring one" writes an override; "any other scope" fails with `Plugin "<name>" is installed at
 * <scope> scope, not <given>. Use --scope <scope> or omit --scope to auto-detect.`, naming the scope
 * auto-detect would pick. A plugin no scope declares is the caller's `not-installed`.
 */
export function writeScope(
  plugin: string,
  requested: CommandScope,
  declaredAt: readonly CommandScope[],
): ScopeWrite {
  if (declaredAt.includes(requested)) return { kind: 'write', scope: requested };
  const strongest = Math.max(...declaredAt.map((scope) => SCOPE_RANK[scope]));
  if (declaredAt.length > 0 && SCOPE_RANK[requested] > strongest) {
    return { kind: 'override', scope: requested };
  }
  const found = detectScope('enable', declaredAt) ?? declaredAt[0];
  if (found === undefined) return { kind: 'not-installed' };
  return {
    kind: 'refused',
    message: `Plugin "${plugin}" is installed at ${found} scope, not ${requested}. Use --scope ${found} or omit --scope to auto-detect.`,
  };
}
