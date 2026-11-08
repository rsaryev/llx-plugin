import { error, type PluginIssue } from '../format/issues.ts';
import type { PolicyScope } from './layers.ts';

/**
 * How a broken settings source is reported (settings.md, "Fix a broken settings file"; errors.md,
 * "Managed settings document could not be parsed"). The docs name what the person sees:
 *
 * - **Settings Error**: a user, project or local file has invalid JSON; "Claude Code skips" it and
 *   keeps going without its settings.
 * - **Settings Warning**: only individual entries fail; "Claude Code skips those values and keeps
 *   the rest of the file in effect" (the repairs of `repair.ts` and a key the file may not carry).
 * - **Managed settings**: the document that is not JSON puts none of its settings in effect.
 */
const MANAGED_PARSE =
  'Managed settings document could not be parsed as a JSON object; none of its settings are in effect. Fix or remove it.';

/** How a report names a source (settings.md, "Settings files and who they affect"). */
export const SCOPE_LABEL: { readonly [S in PolicyScope]: string } = {
  managed: 'managed settings',
  parent: 'parent settings',
  flag: '--settings',
  local: 'project local settings',
  project: 'shared project settings',
  addDir: 'an --add-dir directory',
  user: 'user settings',
};

/** The sources whose broken document is a managed one: the policy tier. */
const IS_POLICY_TIER: { readonly [S in PolicyScope]: boolean } = {
  managed: true,
  parent: true,
  flag: false,
  local: false,
  project: false,
  addDir: false,
  user: false,
};

/**
 * A source that is present and is not a JSON object: `reason` says why when the text did not parse.
 * The file is skipped either way; a managed document also leaves none of its settings in effect.
 */
export function brokenSource(scope: PolicyScope, reason?: string): PluginIssue {
  const why = reason === undefined ? '' : ` (${reason})`;
  if (IS_POLICY_TIER[scope]) return error(`${scope}:`, `${MANAGED_PARSE}${why}`);
  return error(
    `${scope}:`,
    `Settings Error: ${SCOPE_LABEL[scope]} is not a valid JSON object and is skipped${why}`,
  );
}

/** What `/status` and the start-up dialog call a problem (settings.md, "Fix a broken settings file"). */
export type ProblemKind = 'Settings Error' | 'Settings Warning' | 'Managed settings';

const BY_SEVERITY: { readonly [S in PluginIssue['severity']]: ProblemKind } = {
  error: 'Settings Error',
  warning: 'Settings Warning',
};

/**
 * Which of the documented kinds a problem found in `scope` is: an entry that fails is a Settings
 * Warning, a file that does not parse a Settings Error, and anything in the policy tier is reported
 * as managed settings, which keep enforcing the rest of the file.
 */
export const problemKind = (scope: PolicyScope, issue: PluginIssue): ProblemKind =>
  IS_POLICY_TIER[scope] ? 'Managed settings' : BY_SEVERITY[issue.severity];
