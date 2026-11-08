import type { PermissionBehavior } from '../../protocol/official.ts';
import { PERMISSION_BEHAVIORS } from '../../protocol/permission-modes.ts';
import type { PolicyContext } from '../context.ts';
import type { PolicyScope } from '../layers.ts';
import type { PolicyView } from '../view.ts';
import type { PermissionsBlock } from './merge.ts';

/**
 * Which settings files contribute permission rules and directories: `allowManagedPermissionRulesOnly`
 * (settings-reference.md), the policy an embedding host passes (the same entry; permissions.md,
 * "Settings precedence") and workspace trust (permissions.md, "Project allow rules and workspace
 * trust"). A rule is plain text with the file it came from; the host parses it with `parseRule`.
 */
export interface SettingsRule {
  readonly behavior: PermissionBehavior;
  readonly text: string;
  readonly scope: PolicyScope;
}

/** A `permissions.additionalDirectories` entry and the file it came from. */
export interface SettingsDirectory {
  readonly path: string;
  /** The highest file that lists it. */
  readonly scope: PolicyScope;
  /**
   * Only repository settings list it: `.claude/settings.json`, and `.claude/settings.local.json` when
   * git tracks it. Such a directory is a working directory for permissions but "doesn't count" for
   * `blockReadsOutsideWorkingDirectories` and `blockWritesOutsideWorkingDirectories`
   * (settings-reference.md).
   */
  readonly repositoryOnly: boolean;
}

/** What one file hands over once the locks and trust are applied. */
interface Contribution {
  /** Its `ask` and `deny` rules count. */
  readonly restrictions: boolean;
  /** Its `allow` rules count. */
  readonly allow: boolean;
}

/** What the facts about the session decide for a file. */
interface Standing {
  readonly managedOnly: boolean;
  readonly trusted: boolean;
}

/**
 * Per file: whether its rules count, and whether its grants (`allow` rules and `additionalDirectories`)
 * do. "Claude Code then ignores `allow`, `ask`, and `deny` rules in user, project, local, and
 * `--settings` files"; the parent settings "drop their `allow` rules and `additionalDirectories`";
 * project and local grants wait for the trust dialog, "`deny` and `ask` rules aren't affected".
 */
const CONTRIBUTIONS: { readonly [S in PolicyScope]: (standing: Standing) => Contribution } = {
  managed: () => ({ restrictions: true, allow: true }),
  parent: ({ managedOnly }) => ({ restrictions: true, allow: !managedOnly }),
  flag: ({ managedOnly }) => ({ restrictions: !managedOnly, allow: !managedOnly }),
  user: ({ managedOnly }) => ({ restrictions: !managedOnly, allow: !managedOnly }),
  local: ({ managedOnly, trusted }) => ({
    restrictions: !managedOnly,
    allow: !managedOnly && trusted,
  }),
  project: ({ managedOnly, trusted }) => ({
    restrictions: !managedOnly,
    allow: !managedOnly && trusted,
  }),
  addDir: () => ({ restrictions: false, allow: false }),
};

/**
 * Whether a file's `additionalDirectories` count. The lock names "rules", so it leaves the
 * directories of user, project, local and `--settings` files alone; the parent settings drop them
 * (settings-reference.md, `allowManagedPermissionRulesOnly`).
 */
const DIRECTORIES: { readonly [S in PolicyScope]: (standing: Standing) => boolean } = {
  managed: () => true,
  parent: ({ managedOnly }) => !managedOnly,
  flag: () => true,
  user: () => true,
  local: ({ trusted }) => trusted,
  project: ({ trusted }) => trusted,
  addDir: () => false,
};

/** Whether the file is the host's policy, whose `!` rules for Read and Edit are never carved out. */
const IS_HOST_POLICY: { readonly [S in PolicyScope]: boolean } = {
  managed: false,
  parent: true,
  flag: false,
  user: false,
  local: false,
  project: false,
  addDir: false,
};

/** A `Read` or `Edit` rule whose pattern starts with `!`: a carve-out of the managed rules. */
const CARVE_OUT = /^\s*(?:Read|Edit)\(\s*!/;

/**
 * Whether a file's grants may apply: the trust dialog gates the shared project file, and the local
 * file only "when the file is tracked in git, or `.claude` is a symlink" (permissions.md, "When your
 * local settings file needs trust").
 */
const TRUST: { readonly [S in PolicyScope]: (context: PolicyContext) => boolean } = {
  managed: () => true,
  parent: () => true,
  flag: () => true,
  user: () => true,
  addDir: () => true,
  project: (context) => context.isFolderTrusted('project'),
  local: (context) => context.localSettingsTracked !== true || context.isFolderTrusted('local'),
};

/** Whether a file is the repository's, not yours: the shared file, or the local file git tracks. */
const REPOSITORY_FILE: { readonly [S in PolicyScope]: (context: PolicyContext) => boolean } = {
  managed: () => false,
  parent: () => false,
  flag: () => false,
  user: () => false,
  addDir: () => false,
  project: () => true,
  local: (context) => context.localSettingsTracked === true,
};

export interface PermissionLists {
  readonly managedOnly: boolean;
  readonly rules: readonly SettingsRule[];
  readonly directories: readonly SettingsDirectory[];
}

/** The rules of one file that count: the lock, trust and the host's `!` carve-outs applied. */
function rulesOf(
  scope: PolicyScope,
  block: PermissionsBlock,
  contribution: Contribution,
): SettingsRule[] {
  return PERMISSION_BEHAVIORS.flatMap((behavior) => {
    const counts = behavior === 'allow' ? contribution.allow : contribution.restrictions;
    const carvesOut = IS_HOST_POLICY[scope] && behavior !== 'allow';
    return (counts ? (block[behavior] ?? []) : [])
      .filter((text) => !(carvesOut && CARVE_OUT.test(text)))
      .map((text) => ({ behavior, text, scope }));
  });
}

/** The rules and directories in force, in precedence order (highest file first). */
export function permissionLists(view: PolicyView, context: PolicyContext): PermissionLists {
  const managedOnly = view.get('allowManagedPermissionRulesOnly') === true;
  const files = view.eachFromHighest('permissions').map(({ scope, value }) => {
    const standing: Standing = { managedOnly, trusted: TRUST[scope](context) };
    const directories = DIRECTORIES[scope](standing) ? (value.additionalDirectories ?? []) : [];
    return {
      rules: rulesOf(scope, value, CONTRIBUTIONS[scope](standing)),
      directories: directories.map((path): SettingsDirectory => ({
        path,
        scope,
        repositoryOnly: REPOSITORY_FILE[scope](context),
      })),
    };
  });
  return {
    managedOnly,
    rules: files.flatMap((file) => file.rules),
    directories: firstOfEach(files.flatMap((file) => file.directories)),
  };
}

/** Each directory once, as the highest file that lists it; repository-only when every file that lists it is. */
const firstOfEach = (list: readonly SettingsDirectory[]): SettingsDirectory[] =>
  list
    .filter((entry, index) => list.findIndex((other) => other.path === entry.path) === index)
    .map((entry) => ({
      ...entry,
      repositoryOnly: list
        .filter((other) => other.path === entry.path)
        .every((other) => other.repositoryOnly),
    }));
