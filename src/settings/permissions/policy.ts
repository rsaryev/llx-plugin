import type { PolicyContext } from '../context.ts';
import type { PolicyView } from '../view.ts';
import { autoModeSettings, type AutoModeSettings } from './auto-mode.ts';
import { startingMode, type StartInput, type StartingMode } from './default-mode.ts';
import { permissionLists, type SettingsDirectory, type SettingsRule } from './managed-only.ts';

/** The permission keys of the settings as one object over a view (docs/API.md, "Settings"). */
export interface PermissionsPolicy {
  /** `allowManagedPermissionRulesOnly`: managed settings are the only source of permission rules. */
  readonly managedRulesOnly: boolean;
  /** The rules in force, as written, highest file first; the host parses each with `parseRule`. */
  readonly rules: readonly SettingsRule[];
  /** The directories `permissions.additionalDirectories` adds, each once. */
  readonly additionalDirectories: readonly SettingsDirectory[];
  /** A `true` in any file: the file tools refuse reads outside the working directories. */
  readonly blockReadsOutsideWorkingDirectories: boolean;
  /** A `true` in any file: `Write`, `Edit` and `NotebookEdit` refuse paths outside the working directories. */
  readonly blockWritesOutsideWorkingDirectories: boolean;
  /** `permissions.disableBypassPermissionsMode` is `"disable"` in any file. */
  readonly disableBypassPermissionsMode: boolean;
  /** `disableAutoMode` (or `permissions.disableAutoMode`) is `"disable"` in any file. */
  readonly disableAutoMode: boolean;
  /** `skipDangerousModePermissionPrompt` is `true` in any file that carries it. */
  readonly skipDangerousModePermissionPrompt: boolean;
  readonly autoMode: AutoModeSettings;
  /** The mode a new session starts in. */
  startingMode(input: StartInput): StartingMode;
}

export function createPermissionsPolicy(
  view: PolicyView,
  context: PolicyContext,
): PermissionsPolicy {
  const block = view.get('permissions');
  const lists = permissionLists(view, context);
  const disableAutoMode =
    view.get('disableAutoMode') === 'disable' || block?.disableAutoMode === 'disable';
  const disableBypassPermissionsMode = block?.disableBypassPermissionsMode === 'disable';
  return {
    managedRulesOnly: lists.managedOnly,
    rules: lists.rules,
    additionalDirectories: lists.directories,
    blockReadsOutsideWorkingDirectories: block?.blockReadsOutsideWorkingDirectories === true,
    blockWritesOutsideWorkingDirectories: block?.blockWritesOutsideWorkingDirectories === true,
    disableBypassPermissionsMode,
    disableAutoMode,
    skipDangerousModePermissionPrompt: view.get('skipDangerousModePermissionPrompt') === true,
    autoMode: autoModeSettings(view),
    startingMode: (input) =>
      startingMode(
        view,
        {
          disableAutoMode,
          disableBypassPermissionsMode,
          skipDangerousModePermissionPrompt: view.get('skipDangerousModePermissionPrompt') === true,
        },
        input,
      ),
  };
}
