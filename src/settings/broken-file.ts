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
 * - **Managed settings**: the document that is not JSON puts none of its settings in effect, and
 *   Claude Code exits at startup rather than run without the policy (`stopsStartup`).
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
 * Whether a broken source stops Claude Code (errors.md, "Managed settings document could not be
 * parsed": it "exits with code 1 at startup instead of running without the policy the document
 * carries"). The docs say it of the managed documents; the kit holds the parent settings of an
 * embedding host, also policy, to the same rule (spec/judgments.md). Any other source is skipped.
 */
export const stopsStartup = (scope: PolicyScope): boolean => IS_POLICY_TIER[scope];

/**
 * A source that is present and is not a JSON object: `reason` says why when the text did not parse.
 * A user, project, local or `--settings` file is skipped. A managed document is fatal: the line
 * names the failed source (`source`, the path or profile the host read, when it says) before the
 * message, as errors.md shows it.
 */
export function brokenSource(scope: PolicyScope, reason?: string, source?: string): PluginIssue {
  const why = reason === undefined ? '' : ` (${reason})`;
  if (IS_POLICY_TIER[scope]) {
    const named = source === undefined ? '' : `${source}: `;
    return error(`${scope}:`, `${named}${MANAGED_PARSE}${why}`);
  }
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
