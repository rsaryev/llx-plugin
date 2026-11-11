import { MANAGED_UNDER_SAFE_MODE, skippedBy } from './customizations.ts';
import type { Contribution, Customization } from './types.ts';

/**
 * The modes that leave customizations out (cli-reference.md, `--bare`, `--safe-mode`, `--restricted`,
 * `--disable-slash-commands`): which kinds each skips (`customizations.ts`), the variable it sets, and
 * for `--restricted` the rest of its list. What loads under the settings, tool and permission rules
 * is those modules' (`availableTools` reads `restricted`).
 */

/**
 * "Sets `CLAUDE_CODE_SIMPLE`", which "Set to `1`" does (env-vars.md); bare mode "never reads OAuth
 * credentials or the system keychain": authentication comes from `ANTHROPIC_API_KEY` or an
 * `apiKeyHelper` in `--settings` (headless.md, "Start faster with bare mode").
 */
export const bare = (): Contribution => ({
  skipped: skippedBy('bare'),
  env: { CLAUDE_CODE_SIMPLE: '1' },
  readsStoredCredentials: false,
});

/** "Sets `CLAUDE_CODE_SAFE_MODE`", which "Set to `1`" does (env-vars.md). */
export const safeMode = (): Contribution => ({
  skipped: skippedBy('safe-mode'),
  env: { CLAUDE_CODE_SAFE_MODE: '1' },
});

export const disableSlashCommands = (): Contribution => ({
  skipped: skippedBy('disable-slash-commands'),
});

/**
 * `--restricted`: "loads only managed settings and `--settings`", "confines the built-in file tools
 * to the working directories", removes the tools that run commands or code and WebFetch (the rules
 * module's `restricted`), "refuses `bypassPermissions`" (the `--permission-mode` strategy) and
 * "refuses to create cloud sessions".
 */
export const restricted = (): Contribution => ({
  restricted: true,
  fileToolsConfined: true,
  cloudSessions: 'refused',
  settingScopes: ['managed', 'parent', 'flag'],
});

/** Whether a safe-mode session still applies the managed policy of a kind it skips; `undefined` where the docs say nothing. */
export const managedPolicyUnderSafeMode = (kind: Customization): boolean | undefined => {
  const treatment = MANAGED_UNDER_SAFE_MODE[kind];
  return treatment === undefined ? undefined : treatment === 'applies';
};
