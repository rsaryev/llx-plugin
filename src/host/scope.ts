import { CONFIG_DIR_VARIABLE } from '../format/config-directory.ts';
import type { ScopeRequest } from '../foundation/scope-folders.ts';
import type { SubstitutionScope } from '../loading/index.ts';
import type { SessionDirectories } from './session-directories.ts';
import { portsOf } from './session-environment.ts';
import type { SessionOptions } from './session-types.ts';
import type { ActivePlugin, HostState } from './state.ts';

/** One session's state and the options of its turn: what a scope is made over. */
export interface ScopeUse {
  readonly state: HostState;
  readonly options: SessionOptions;
}

/**
 * What a plugin's `${...}` references resolve against, in one session's turn (docs/API.md,
 * "Variable substitution"): the session's ports (`portsOf`), as its hooks and skills read them, so
 * its locations are the session's and `${VAR}` reads the environment its hooks run in.
 */
export function scopeOf(
  use: ScopeUse,
  plugin: ActivePlugin,
  signal?: AbortSignal,
): SubstitutionScope {
  const { locations, environment } = portsOf(use.state, use.options);
  return {
    pluginId: plugin.id,
    locations,
    environment,
    userConfig: plugin.userConfig,
    windows: use.state.options.windows ?? false,
    ...(use.state.options.shellPaths === undefined
      ? {}
      : { shellPaths: use.state.options.shellPaths }),
    ...(signal === undefined ? {} : { signal }),
  };
}

/**
 * What a scan of the scope folders is asked for in one session: the home (`Locations.homeDir()`), the
 * live directories, and `CLAUDE_CONFIG_DIR` as the session's environment gives it (the `Environment`
 * port, with the user and managed settings `env` over it: a project or local file's value is ignored,
 * env-vars.md), which moves the user scope's `~/.claude` folders.
 */
export function scopeRequestOf(use: ScopeUse, directories: SessionDirectories): ScopeRequest {
  const { locations, environment } = portsOf(use.state, use.options);
  return {
    home: locations.homeDir(),
    cwd: directories.cwd(),
    addedDirectories: directories.added(),
    configDir: environment.get(CONFIG_DIR_VARIABLE),
  };
}

/** The host's extra scope folders, as a scan of the scope folders takes them (`ScopeContext`). */
export const extraFoldersOf = (state: HostState) =>
  state.options.extraScopeFolders === undefined
    ? {}
    : { extraScopeFolders: state.options.extraScopeFolders };
