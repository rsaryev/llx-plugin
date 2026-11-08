import type { Environment, Locations } from '../../ports/index.ts';
import type { ResolvedUserConfig } from './user-config.ts';

/**
 * What a plugin's `${...}` references resolve against. Everything is data or a port: the kit asks
 * `Locations` for paths (and so for the data folder, only when referenced) and `Environment` for
 * `${VAR}`; it knows no machine.
 */
export interface SubstitutionScope {
  /** The plugin identifier the host uses (`name@marketplace`, or the bare name). */
  readonly pluginId: string;
  readonly locations: Locations;
  readonly environment: Environment;
  readonly userConfig: ResolvedUserConfig;
  /**
   * True on a Windows host: its paths come back with backslashes and the docs write them with
   * forward slashes in most fields (plugins/manifest-reference.md, "Quoting and path
   * separators"). The kit cannot tell (L3), so the host says.
   */
  readonly windows: boolean;
  /**
   * Variables another layer owns, substituted in the same single pass: skills pass
   * `CLAUDE_SKILL_DIR`, `CLAUDE_SESSION_ID`, `CLAUDE_EFFORT`. They win over `${VAR}` of the
   * environment.
   */
  readonly extra?: Readonly<Record<string, string>>;
  /**
   * How a monitor `command` writes the three path variables. `pasted` (the default) is the docs'
   * form: the path itself, so the author wraps the variable in double quotes. `environment-reference`
   * writes `${CLAUDE_PLUGIN_ROOT}` and has the process environment supply the value, so a path
   * holding shell metacharacters is never parsed as shell (spec/judgments.md).
   */
  readonly monitorPaths?: MonitorPaths;
  readonly signal?: AbortSignal;
}

/** The two ways a monitor `command` carries a path variable. */
export type MonitorPaths = 'pasted' | 'environment-reference';

/** Which `${user_config.KEY}` values a field takes (plugins/manifest-reference.md, "Reference a saved value"). */
export type UserConfigPolicy = 'allow' | 'non-sensitive' | 'refuse';

/** How a path variable is written into the text. */
export type PathRendering = 'normalized' | 'native' | 'environment-reference' | 'shell-reference';

export type EnvironmentExpansion = 'expand' | 'literal';

/** What one field accepts: the differences the docs list per plugin component. */
export interface FieldPolicy {
  /**
   * `allow`: any value. `non-sensitive`: a sensitive value becomes a placeholder (skill and agent
   * content). `refuse`: the reference stays as written (shell fields; the caller reports it).
   */
  readonly userConfig: UserConfigPolicy;
  /** `expand`: `${VAR}` and `${VAR:-default}` read the environment. `literal`: left as written. */
  readonly environment: EnvironmentExpansion;
  /**
   * `normalized`: forward slashes on a Windows host. `native`: as the host reports them (exec-form
   * hooks). `environment-reference`: PowerShell's `${env:NAME}`, left to the process environment.
   * `shell-reference`: the POSIX `${NAME}`, left to the process environment (monitor commands that
   * opt in, `SubstitutionScope.monitorPaths`).
   */
  readonly paths: PathRendering;
  /** Names read as empty even when set, a default ignored (MCP `url` and `headers` credentials). */
  readonly readsAsEmpty?: (name: string) => boolean;
}
