/** Helpers of the merge-core tests. */
import type { PluginIssue } from '../../src/format/issues.ts';
import { createGeneralView } from '../../src/settings/general/index.ts';
import { readSettingsLayer, type PolicyScope } from '../../src/settings/index.ts';

export { createGeneralView };

/** What reading one source's JSON said (the source is `--settings` unless another scope is named). */
export const issuesOfFlag = (raw: unknown, scope: PolicyScope = 'flag'): readonly PluginIssue[] =>
  readSettingsLayer(scope, raw).issues;
