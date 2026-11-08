import type { PolicyScope } from '../layers.ts';
import type { PolicyView } from '../view.ts';
import { PERMISSION_BEHAVIORS } from '../../protocol/permission-modes.ts';
import type { PermissionBehavior } from '../../protocol/official.ts';

/** A rule as written in a settings file, with the file's scope. */
export interface RuleEntry {
  readonly rule: string;
  readonly scope: PolicyScope;
}

/** A directory `permissions.additionalDirectories` adds, with the file's scope. */
export interface AddedDirectory {
  readonly directory: string;
  readonly scope: PolicyScope;
}

/** The rules of each behaviour, highest scope first, a rule written in two files once, and the added directories. */
export type PermissionRuleLists = { readonly [B in PermissionBehavior]: readonly RuleEntry[] } & {
  readonly additionalDirectories: readonly AddedDirectory[];
};

/**
 * What the host learned about the local settings file. permissions.md ("When your local settings
 * file needs trust"): the file is normally your own, so "Claude Code applies its allow rules and
 * additional directories without the trust step. When the file is tracked in git, or `.claude` is a
 * symlink, Claude Code treats it as repository-supplied instead and holds its rules until you trust
 * the folder." Claude Code runs git only once the folder is trusted: before that the host has no
 * answer and says `tracked: true`, which holds the file like project settings.
 */
export interface LocalFileFacts {
  /** `.claude/settings.local.json` is tracked in git. */
  readonly tracked: boolean;
  /** `.claude` is a symlink. */
  readonly claudeDirIsSymlink: boolean;
}

/**
 * Whether the files of a scope wait for the user's trust of the folder: the shared project file
 * always (permissions.md, "Project allow rules and workspace trust"), the local file only when it is
 * repository-supplied, every other source never.
 */
const WAITS_FOR_TRUST: { readonly [S in PolicyScope]: (local: LocalFileFacts) => boolean } = {
  managed: () => false,
  parent: () => false,
  flag: () => false,
  local: (local) => local.tracked || local.claudeDirIsSymlink,
  project: () => true,
  user: () => false,
  addDir: () => false,
};

/** Whether the user trusts the folder a file of this scope belongs to (the host asks the dialog's record). */
export type ScopeTrust = (scope: PolicyScope) => boolean;

/**
 * What `allowManagedPermissionRulesOnly` keeps of one layer. Managed settings keep every rule. The
 * embedding host's parent settings "count as part of the managed tier" but their `allow` rules are
 * dropped, "and keeps their `deny` and `ask` rules". Every other source loses all of them.
 */
const KEPT_UNDER_LOCK: { readonly [S in PolicyScope]: readonly PermissionBehavior[] } = {
  managed: PERMISSION_BEHAVIORS,
  parent: ['deny', 'ask'],
  flag: [],
  local: [],
  project: [],
  user: [],
  addDir: [],
};

/**
 * A `Read` or `Edit` rule whose pattern starts with `!` carves paths out of the rules above it.
 * settings-reference.md, `allowManagedPermissionRulesOnly`: a host's parent settings keep their
 * `deny` and `ask` rules "except `Read` and `Edit` rules whose pattern starts with `!`. A host can't
 * carve paths out of the managed rules with a `!` rule, whether or not you set this key."
 */
const CARVE_OUT = /^(?:Read|Edit)\(!/;

const isHostCarveOut = (scope: PolicyScope, behavior: PermissionBehavior, rule: string): boolean =>
  scope === 'parent' && behavior !== 'allow' && CARVE_OUT.test(rule);

function textList(permissions: unknown, name: string): readonly string[] {
  if (typeof permissions !== 'object' || permissions === null) return [];
  const list: unknown = Reflect.get(permissions, name);
  return Array.isArray(list) ? list.filter((entry) => typeof entry === 'string') : [];
}

/**
 * The permission rules every settings file adds up to (settings.md, "Lists merge instead of
 * overriding": `permissions.allow` combines across scopes; permissions.md, "Settings precedence": a
 * level cannot remove another's rule, so a managed deny stays whatever the others say). When the
 * managed tier sets `allowManagedPermissionRulesOnly` the other sources add none (settings-reference.md).
 * A repository's `allow` rules and `additionalDirectories` apply only once the folder is trusted
 * (the local file only when `local` says it is repository-supplied); `deny` and `ask` rules "only
 * restrict" and apply at once.
 */
export function permissionRuleLists(
  view: PolicyView,
  trusted: ScopeTrust,
  local: LocalFileFacts,
): PermissionRuleLists {
  const held = (scope: PolicyScope): boolean => WAITS_FOR_TRUST[scope](local) && !trusted(scope);
  const lock = view.get('allowManagedPermissionRulesOnly') === true;
  const holders = view.eachFromHighest('permissions');
  const entriesOf = (behavior: PermissionBehavior): readonly RuleEntry[] => {
    const entries = holders
      .filter((holder) => !lock || KEPT_UNDER_LOCK[holder.scope].includes(behavior))
      .filter((holder) => behavior !== 'allow' || !held(holder.scope))
      .flatMap((holder) =>
        textList(holder.value, behavior)
          .filter((rule) => !isHostCarveOut(holder.scope, behavior, rule))
          .map((rule) => ({ rule, scope: holder.scope })),
      );
    // The highest file's entry stands for a rule several files write.
    return entries.filter(
      (entry, index) => entries.findIndex((one) => one.rule === entry.rule) === index,
    );
  };
  const directories = holders
    .filter((holder) => !lock || holder.scope === 'managed')
    .filter((holder) => !held(holder.scope))
    .flatMap((holder) =>
      textList(holder.value, 'additionalDirectories').map((directory) => ({
        directory,
        scope: holder.scope,
      })),
    );
  return {
    allow: entriesOf('allow'),
    deny: entriesOf('deny'),
    ask: entriesOf('ask'),
    additionalDirectories: directories.filter(
      (entry, index) => directories.findIndex((one) => one.directory === entry.directory) === index,
    ),
  };
}
