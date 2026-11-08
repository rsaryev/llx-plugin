/**
 * What a check found, in the shape `claude plugin validate` reports (plugins/manifest-reference.md,
 * "Validate the manifest"): an error keeps the plugin from loading, a warning does not. `path`
 * names the field (`userConfig.api_token`) or the file the issue is about.
 */
export const SEVERITIES = ['error', 'warning'] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface PluginIssue {
  readonly severity: Severity;
  readonly path: string;
  readonly message: string;
}

export const error = (path: string, message: string): PluginIssue => ({
  severity: 'error',
  path,
  message,
});

export const warning = (path: string, message: string): PluginIssue => ({
  severity: 'warning',
  path,
  message,
});

const BLOCKS: { readonly [S in Severity]: boolean } = { error: true, warning: false };

/** True when any issue keeps the plugin from loading. */
export const blocksLoading = (issues: readonly PluginIssue[]): boolean =>
  issues.some((found) => BLOCKS[found.severity]);
