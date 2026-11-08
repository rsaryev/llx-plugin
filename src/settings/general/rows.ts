import type { Settings } from '../../protocol/official.ts';
import { EFFORT_LEVELS } from '../../protocol/effort.ts';
import { PERMISSION_MODES } from '../../protocol/permission-modes.ts';
import type { ValueSpec } from '../key-spec.ts';
import { MERGES } from '../merge.ts';
import { isRecord } from '../record.ts';
import {
  ANY_SCOPE,
  FALSE_FROM_ANY_SCOPE,
  TRUE_FROM_ANY_SCOPE,
  type ManagedException,
} from './exceptions.ts';
import type { GeneralKey, GeneralValues } from './keys.ts';

/** The value `path` leads to inside a settings object, whatever the blocks on the way. */
function valueAt(settings: Settings, path: readonly string[]): unknown {
  return path.reduce<unknown>(
    (block, name) => (isRecord(block) ? block[name] : undefined),
    settings,
  );
}

/** A row for a key inside a block: read at `path`, and written back there in the merged settings. */
function nested<K extends GeneralKey>(
  path: readonly string[],
  row: Omit<ValueSpec<GeneralValues[K]>, 'read' | 'path'>,
  isValue: (value: unknown) => value is NonNullable<GeneralValues[K]>,
): ValueSpec<GeneralValues[K]> {
  return {
    ...row,
    path,
    read: (settings) => {
      const found = valueAt(settings, path);
      return isValue(found) ? found : undefined;
    },
  };
}

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
type DefaultMode = NonNullable<GeneralValues['permissions.defaultMode']>;
const isDefaultMode = (value: unknown): value is DefaultMode =>
  PERMISSION_MODES.some((mode) => mode === value);

/** `autoMode.classifyAllShell`: `true` from user or `--settings` beats a managed `false`. */
const CLASSIFY_ALL_SHELL: ManagedException<boolean | undefined> = {
  ladder: [false, true],
  honoredFrom: ['user', 'flag'],
  onlyWhenStricter: [],
};

/** `remoteControlAtStartup`: a project or local `false` beats a managed `true`; their `true` is ignored. */
const REMOTE_CONTROL: ManagedException<boolean> = {
  ladder: [true, false],
  honoredFrom: ['project', 'local'],
  onlyWhenStricter: ['project', 'local'],
};

/** `crossSessionInbound`: a stricter project or local value applies on the `accept` < `hold` < `refuse` ladder. */
const CROSS_SESSION: ManagedException<GeneralValues['crossSessionInbound']> = {
  ladder: ['accept', 'hold', 'refuse'],
  honoredFrom: ['project', 'local'],
  onlyWhenStricter: ['project', 'local'],
  // An unrecognized value in a user, project, local or `--settings` file holds inbound messages.
  unreadable: { floor: 'hold', from: ['flag', 'local', 'project', 'user'] },
};

/** `maxEffortLevel`: "When several scopes set a cap, the lowest applies"; `"max"` sets no cap. */
const LOWEST_CAP: ManagedException<GeneralValues['maxEffortLevel']> = {
  ladder: EFFORT_LEVELS.toReversed(),
  honoredFrom: ANY_SCOPE,
  onlyWhenStricter: [],
};

/**
 * One row per general key, from its entry in settings-reference.md (the Scope line and the notes
 * under it) and settings.md, "Lists merge instead of overriding" and "Exceptions to managed
 * settings precedence". A key with no row is combined by the general rule: blocks merge, lists
 * union, a single value comes from the highest file.
 */
export const GENERAL_SPECS: { readonly [K in GeneralKey]: ValueSpec<GeneralValues[K]> } = {
  allowManagedPermissionRulesOnly: { scopes: 'managed', merge: MERGES.highestWins },
  // "User or managed" (settings-reference.md, `autoMode`); `classifyAllShell` is "read wherever `autoMode` is read".
  autoMode: { scopes: 'userManagedFlag', merge: MERGES.deepMerge },
  'autoMode.classifyAllShell': nested<'autoMode.classifyAllShell'>(
    ['autoMode', 'classifyAllShell'],
    { scopes: 'userManagedFlag', merge: MERGES.highestWins, exception: CLASSIFY_ALL_SHELL },
    isBoolean,
  ),
  // Managed settings define it: that list applies as-is. Otherwise "the arrays merge as usual".
  availableModels: { scopes: 'anyAndParent', merge: MERGES.unionArrays, managedOwns: true },
  crossSessionInbound: {
    scopes: 'anyAndParent',
    merge: MERGES.highestWins,
    exception: CROSS_SESSION,
  },
  disableClaudeAiConnectors: {
    scopes: 'anyAndParent',
    merge: MERGES.highestWins,
    exception: TRUE_FROM_ANY_SCOPE,
  },
  // "`disableArtifact: true` from any scope" counts as `enableArtifact: false`; its `false` is ignored.
  enableArtifact: {
    scopes: 'anyAndParent',
    merge: MERGES.highestWins,
    exception: FALSE_FROM_ANY_SCOPE,
    read: (settings) => (settings.disableArtifact === true ? false : settings.enableArtifact),
  },
  env: { scopes: 'anyAndParent', merge: MERGES.deepMerge },
  // "An ordered chain where position carries meaning": the whole value of the highest file.
  fallbackModel: { scopes: 'anyAndParent', merge: MERGES.highestWins },
  isolatePeerMachines: {
    scopes: 'anyAndParent',
    merge: MERGES.highestWins,
    exception: TRUE_FROM_ANY_SCOPE,
  },
  maxEffortLevel: { scopes: 'anyAndParent', merge: MERGES.highestWins, exception: LOWEST_CAP },
  model: { scopes: 'anyAndParent', merge: MERGES.highestWins },
  // One lineup, "ignores the key in project and local settings"; the highest of the three wins whole.
  modelPicker: { scopes: 'userManagedFlag', merge: MERGES.highestWins },
  // The embedding host's parent settings may carry rules too (permissions.md, "Settings precedence").
  permissions: { scopes: 'anyAndParent', merge: MERGES.deepMerge },
  'permissions.blockReadsOutsideWorkingDirectories':
    nested<'permissions.blockReadsOutsideWorkingDirectories'>(
      ['permissions', 'blockReadsOutsideWorkingDirectories'],
      { scopes: 'anyAndParent', merge: MERGES.highestWins, exception: TRUE_FROM_ANY_SCOPE },
      isBoolean,
    ),
  'permissions.blockWritesOutsideWorkingDirectories':
    nested<'permissions.blockWritesOutsideWorkingDirectories'>(
      ['permissions', 'blockWritesOutsideWorkingDirectories'],
      { scopes: 'anyAndParent', merge: MERGES.highestWins, exception: TRUE_FROM_ANY_SCOPE },
      isBoolean,
    ),
  // The value decides where it is read from (settings.md, "A value you set is ignored").
  'permissions.defaultMode': nested<'permissions.defaultMode'>(
    ['permissions', 'defaultMode'],
    { scopes: 'repositoryCannotElevate', merge: MERGES.highestWins },
    isDefaultMode,
  ),
  remoteControlAtStartup: {
    scopes: 'anyAndParent',
    merge: MERGES.highestWins,
    exception: REMOTE_CONTROL,
  },
  sandbox: { scopes: 'anyAndParent', merge: MERGES.deepMerge },
  // "Only managed" locks (managed-settings.md, "Keys only a managed source can set").
  'sandbox.filesystem.allowManagedReadPathsOnly':
    nested<'sandbox.filesystem.allowManagedReadPathsOnly'>(
      ['sandbox', 'filesystem', 'allowManagedReadPathsOnly'],
      { scopes: 'managed', merge: MERGES.highestWins },
      isBoolean,
    ),
  'sandbox.network.allowManagedDomainsOnly': nested<'sandbox.network.allowManagedDomainsOnly'>(
    ['sandbox', 'network', 'allowManagedDomainsOnly'],
    { scopes: 'managed', merge: MERGES.highestWins },
    isBoolean,
  ),
  spinnerTipsEnabled: { scopes: 'anyAndParent', merge: MERGES.highestWins },
  useAutoModeDuringPlan: {
    scopes: 'userLocalManagedFlag',
    merge: MERGES.highestWins,
    exception: FALSE_FROM_ANY_SCOPE,
  },
};
