import type { FileScope } from './reach.ts';

/**
 * When an edit reaches a running session (settings.md, "When edits take effect"; managed-settings.md,
 * "Where and when a policy applies"). A pure decision: the host watches the files, reloads and fires
 * the `ConfigChange` hook; this says what each change is owed.
 */

/** How the change arrived: a settings file Claude Code watches, or a managed source delivered on a schedule. */
export type Arrival = 'file' | 'mdm' | 'server-managed';

export interface SettingsEdit {
  readonly scope: FileScope;
  readonly arrival: Arrival;
  /** The top-level key, or the dotted path of one inside a block; `undefined` for a change to the file as a whole. */
  readonly key?: string;
  /** The edit removes the key rather than setting it. */
  readonly removed?: boolean;
}

export type Applies =
  /** The running session reloads it: "most edits ... without a restart". */
  | 'now'
  /** A managed source reaches the session "on a schedule rather than on save". */
  | 'on-schedule'
  /** "reads some keys only once, at session start". */
  | 'next-session'
  /** The running session keeps the old behaviour until each session restarts. */
  | 'after-restart';

export interface EditEffect {
  readonly applies: Applies;
  /** Claude Code runs the `ConfigChange` hook "for each settings-file change it detects, not for managed settings that arrive from MDM or the claude.ai console". */
  readonly configChangeHook: boolean;
}

/** What each arrival owes before any key is looked at. */
const BY_ARRIVAL: { readonly [A in Arrival]: EditEffect } = {
  file: { applies: 'now', configChangeHook: true },
  mdm: { applies: 'on-schedule', configChangeHook: false },
  'server-managed': { applies: 'on-schedule', configChangeHook: false },
};

/**
 * The keys read once, when a session starts. settings.md names `model`, `effortLevel` and
 * `modelSettings` as the ones most likely edited mid-session, and "Admin-side keys that also wait
 * for a restart, such as `requiredMinimumVersion`"; managed-settings.md adds `forceRemoteSettingsRefresh`
 * and says a new or changed `policyHelper` "takes effect at the next launch".
 */
const READ_AT_START: ReadonlySet<string> = new Set([
  'model',
  'effortLevel',
  'modelSettings',
  'requiredMinimumVersion',
  'forceRemoteSettingsRefresh',
  'policyHelper',
]);

/**
 * Keys a running session keeps in force after the edit that lifts them: "If you remove
 * `permissions.blockReadsOutsideWorkingDirectories` mid-session, the file tools keep the block in
 * the running session. To lift it, remove the key from every settings file that sets it, then
 * restart each running session."
 */
const LIFTED_ON_RESTART: ReadonlySet<string> = new Set([
  'permissions.blockReadsOutsideWorkingDirectories',
]);

/** What an edit is owed: the arrival's effect, unless the key waits for a restart. */
export function editEffect(edit: SettingsEdit): EditEffect {
  const arrival = BY_ARRIVAL[edit.arrival];
  const { key } = edit;
  if (key === undefined) return arrival;
  if (edit.removed === true && LIFTED_ON_RESTART.has(key)) {
    return { ...arrival, applies: 'after-restart' };
  }
  return READ_AT_START.has(key) ? { ...arrival, applies: 'next-session' } : arrival;
}

/**
 * Whether a settings file created while a session runs is loaded by it: "if its folder existed when
 * the session started. For the project's `.claude/` folder, it loads the file even when you create
 * the folder in the same session."
 */
const LOADS_WHEN_CREATED: {
  readonly [S in FileScope]: (folderExistedAtStart: boolean) => boolean;
} = {
  user: (existed) => existed,
  project: () => true,
  local: (existed) => existed,
  managed: (existed) => existed,
};

export const loadsFileCreatedMidSession = (
  scope: FileScope,
  folderExistedAtStart: boolean,
): boolean => LOADS_WHEN_CREATED[scope](folderExistedAtStart);
