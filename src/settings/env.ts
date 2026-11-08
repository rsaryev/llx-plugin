import { warning, type PluginIssue } from '../format/issues.ts';
import { HOST_OWNED, OFF_VALUES, REPOSITORY_FORBIDDEN, onList } from './env-names.ts';
import { orderedLayers, type PolicyLayer, type PolicyScope } from './layers.ts';
import { isRecord } from './record.ts';

/**
 * The `env` block of the settings files (env-vars.md, "Set variables in settings files" and
 * "Precedence"; settings-reference.md, `env`): the variables a host puts in its environment, and so
 * in every process it starts. Pure over the layers a host read; the host applies the result.
 *
 * - Files combine per variable, the highest precedence winning (settings.md, "Settings precedence").
 * - Project and local files count once the folder is trusted, and cannot set what a checked-out
 *   repository must not control; no file sets what the hosting environment owns.
 * - A value replaces the one inherited from the shell, and is copied as written (no shell expands
 *   `~` or `$HOME`); an empty string is a value.
 */

/** What `resolveSettingsEnv` asks the host about its machine. */
export interface SettingsEnvContext {
  /** Whether the user trusted the workspace (settings-reference.md, "When Claude Code applies `env` values"). */
  readonly isFolderTrusted: (scope: 'project' | 'local') => boolean;
  /** The environment Claude Code was launched with: an off value of a project file never replaces one set here. */
  readonly environment?: Readonly<Record<string, string | undefined>>;
  /**
   * Claude Desktop or a self-hosted runner built the launch environment: "Claude Code ignores an `env`
   * value from any settings file for a variable the launch environment already sets."
   */
  readonly launchOwnsEnvironment?: boolean;
  /** The host's variable names are case-insensitive. */
  readonly windows?: boolean;
}

export const IGNORED_REASONS = [
  'repository',
  'host-owned',
  'untrusted',
  'launch',
  'not-text',
] as const;
export type IgnoredReason = (typeof IGNORED_REASONS)[number];

/** A variable of a file that does not reach the environment, and why. Never a value. */
export interface IgnoredVariable {
  readonly name: string;
  readonly scope: PolicyScope;
  readonly reason: IgnoredReason;
}

export interface SettingsEnv {
  /** The variables to put in the environment, replacing what the shell exported. */
  readonly values: Readonly<Record<string, string>>;
  readonly ignored: readonly IgnoredVariable[];
  readonly issues: readonly PluginIssue[];
}

/**
 * What each file may carry. `trustScope` names the folder whose trust the file waits for; `repository`
 * marks a file a checked-out repository controls. Judgment (spec/judgments.md): `parent` settings, which
 * the docs open to the policy keys only, and an `--add-dir` directory's files, which carry two keys
 * (permissions.md), contribute no variable.
 */
interface EnvScopeRule {
  readonly carries: boolean;
  readonly repository: boolean;
  readonly trustScope?: 'project' | 'local';
}

const SCOPE_RULES: { readonly [S in PolicyScope]: EnvScopeRule } = {
  managed: { carries: true, repository: false },
  parent: { carries: false, repository: false },
  flag: { carries: true, repository: false },
  local: { carries: true, repository: true, trustScope: 'local' },
  project: { carries: true, repository: true, trustScope: 'project' },
  user: { carries: true, repository: false },
  addDir: { carries: false, repository: false },
};

const isOffValue = (name: string, value: string): boolean =>
  OFF_VALUES.get(name)?.includes(value) ?? false;

interface Candidate {
  readonly name: string;
  readonly value: string;
  readonly scope: PolicyScope;
}

/** Why a variable of this file does not apply, or `undefined` when it does. */
function refusal(
  candidate: Candidate,
  context: SettingsEnvContext,
  windows: boolean,
): IgnoredReason | undefined {
  const rule = SCOPE_RULES[candidate.scope];
  const { name, value } = candidate;
  const launchSets = (context.environment?.[name] ?? undefined) !== undefined;
  if (onList(HOST_OWNED, name, windows)) return 'host-owned';
  if (rule.repository && onList(REPOSITORY_FORBIDDEN, name, windows)) {
    // "Only these values still apply ...: an off value such as `0`", never over the launch environment.
    return isOffValue(name, value) && !launchSets ? undefined : 'repository';
  }
  return context.launchOwnsEnvironment === true && launchSets ? 'launch' : undefined;
}

function candidatesOf(layer: PolicyLayer): { found: Candidate[]; issues: PluginIssue[] } {
  const raw = layer.settings.env;
  if (!isRecord(raw)) return { found: [], issues: [] };
  const found: Candidate[] = [];
  const issues: PluginIssue[] = [];
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value === 'string') found.push({ name, value, scope: layer.scope });
    else
      issues.push(
        warning(`env.${name}`, `The value of "${name}" in env is not text and is ignored`),
      );
  }
  return { found, issues };
}

/** The variables of the layers' `env` blocks that reach the environment. */
export function resolveSettingsEnv(
  layers: readonly PolicyLayer[],
  context: SettingsEnvContext,
): SettingsEnv {
  const windows = context.windows ?? false;
  const values = new Map<string, string>();
  const ignored: IgnoredVariable[] = [];
  const issues: PluginIssue[] = [];
  // Lowest precedence first, so a higher file's value replaces a lower one's.
  for (const layer of orderedLayers(layers).toReversed()) {
    const rule = SCOPE_RULES[layer.scope];
    if (!rule.carries) continue;
    const { found, issues: unreadable } = candidatesOf(layer);
    issues.push(...unreadable);
    const trusted = rule.trustScope === undefined || context.isFolderTrusted(rule.trustScope);
    for (const candidate of found) {
      const reason = trusted ? refusal(candidate, context, windows) : 'untrusted';
      if (reason === undefined) values.set(candidate.name, candidate.value);
      else ignored.push({ name: candidate.name, scope: candidate.scope, reason });
    }
  }
  // `Object.fromEntries` defines own properties, so a JSON-parsed `__proto__` name stays a name.
  return { values: Object.fromEntries(values), ignored, issues };
}

/**
 * The environment after the settings' variables are written into it: "Claude Code writes each `env`
 * entry into the process environment, replacing the value inherited from the shell". Nothing is ever
 * removed: "In a settings file you can set a variable but you can't remove one". On Windows a name
 * replaces the inherited one whatever its case.
 */
export function applySettingsEnv(
  inherited: Readonly<Record<string, string>>,
  settings: Readonly<Record<string, string>>,
  windows: boolean,
): Record<string, string> {
  const replaced = new Set(
    Object.keys(settings).map((name) => (windows ? name.toUpperCase() : name)),
  );
  const kept = Object.entries(inherited).filter(
    ([name]) => !replaced.has(windows ? name.toUpperCase() : name),
  );
  return { ...Object.fromEntries(kept), ...settings };
}
