import { error, type PluginIssue } from '../../format/issues.ts';
import { referencesUserConfig } from './user-config.ts';

/**
 * A field whose value is passed to a shell refuses `${user_config.*}` (plugins/manifest-reference.md,
 * "Fields that run through a shell"): "A component that references it in one of these fields fails
 * with an error instead of running, because the field's value is passed to a shell that would
 * re-parse the substituted value". The check reads the template, never a value, so it fires even
 * when nothing is configured yet (errors.md, "Plugin command references user_config in a shell
 * command"). Each surface has its own message and context; the surface's resolver owns its guard and
 * calls this one function, so the three surfaces (shell-form hook, monitor, `headersHelper`) never
 * share code that could drift. This file holds the `headersHelper` guard.
 */
export interface ShellGuard<Context> {
  /** The documented message of the surface, quoted from errors.md. */
  message(context: Context): string;
}

/** The error for a template that references `${user_config.*}`, or `undefined` when it does not. */
export function rejectUserConfigInShell<Context>(
  guard: ShellGuard<Context>,
  template: string,
  context: Context,
  path: string,
): PluginIssue | undefined {
  return referencesUserConfig(template) ? error(path, guard.message(context)) : undefined;
}

/** An MCP `headersHelper`, which runs through a shell (mcp.md, "dynamic headers"). */
export const HEADERS_HELPER_GUARD: ShellGuard<{ readonly server: string }> = {
  message: ({ server }) =>
    `headersHelper for MCP server '${server}' references \${user_config.*}. The substituted value would be passed to a shell; read the value inside the helper script instead (e.g. from an env var set in the server's "env" block).`,
};
