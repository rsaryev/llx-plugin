import { REPOSITORY_FILES } from '../key-spec.ts';
import type { PolicyLayer } from '../layers.ts';
import { resolveEnvBlocks, type NotAppliedVariable, type Variables } from './resolve-env.ts';

/**
 * The `env` block of the settings files for a host that knows its folders' trust per file (env-vars.md,
 * "Set variables in settings files" and "Precedence"; settings-reference.md, `env`). The same rules as
 * `resolveEnv`, in the shape a host applies directly: the values to write over its environment.
 */

/** What `resolveSettingsEnv` asks the host about its machine. */
export interface SettingsEnvContext {
  /** Whether the user trusted the workspace (settings-reference.md, "When Claude Code applies `env` values"). */
  readonly isFolderTrusted: (scope: 'project' | 'local') => boolean;
  /** The environment Claude Code was launched with: an off value of a project file never replaces one set here. */
  readonly environment?: Variables;
  /**
   * Claude Desktop or a self-hosted runner built the launch environment: "Claude Code ignores an `env`
   * value from any settings file for a variable the launch environment already sets."
   */
  readonly launchOwnsEnvironment?: boolean;
  /** The host's variable names are case-insensitive. */
  readonly windows?: boolean;
}

export interface SettingsEnv {
  /** The variables to put in the environment, replacing what the shell exported. */
  readonly values: Readonly<Record<string, string>>;
  /** The variables of a file that do not reach the environment, and why. Never a value. */
  readonly ignored: readonly NotAppliedVariable[];
}

const isRepositoryScope = (scope: string): scope is 'project' | 'local' =>
  REPOSITORY_FILES.some((one) => one === scope);

/** The variables of the layers' `env` blocks that reach the environment. */
export function resolveSettingsEnv(
  layers: readonly PolicyLayer[],
  context: SettingsEnvContext,
): SettingsEnv {
  const shell = context.environment ?? {};
  const { settings, notApplied } = resolveEnvBlocks(layers, {
    startsNow: (scope) => !isRepositoryScope(scope) || context.isFolderTrusted(scope),
    input: {
      shell,
      ...(context.launchOwnsEnvironment === true ? { launchEnvironment: shell } : {}),
      windows: context.windows ?? false,
    },
  });
  return { values: settings, ignored: notApplied };
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
  const fold = (name: string): string => (windows ? name.toUpperCase() : name);
  const replaced = new Set(Object.keys(settings).map(fold));
  const kept = Object.entries(inherited).filter(([name]) => !replaced.has(fold(name)));
  return { ...Object.fromEntries(kept), ...settings };
}
