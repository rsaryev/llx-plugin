/**
 * The settings scopes a plugin can be enabled or installed in (plugins/host-marketplace.md, "Migrate
 * users with a renames map" and "Uninstall removed plugins from users' machines": "the user,
 * project, and local settings scopes"; managed settings are the one the kit and Claude Code cannot
 * write). A scope is a name only; reading the settings of each is the settings stream's.
 */
export const INSTALL_SCOPES = ['user', 'project', 'local', 'managed'] as const;
export type InstallScope = (typeof INSTALL_SCOPES)[number];

/** Whether the user can have a plugin changed in the scope: every scope but `managed`. */
const WRITABLE: { readonly [S in InstallScope]: boolean } = {
  user: true,
  project: true,
  local: true,
  managed: false,
};

export const isWritableScope = (scope: InstallScope): boolean => WRITABLE[scope];
