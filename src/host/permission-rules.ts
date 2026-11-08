import type { PluginIssue } from '../format/issues.ts';
import { parseRule, type PermissionRule, type RuleSource } from '../rules/index.ts';
import type { PolicyScope, PolicyView } from '../settings/index.ts';
import {
  permissionRuleLists,
  type AddedDirectory,
  type LocalFileFacts,
  type ScopeTrust,
} from '../settings/general/index.ts';

/**
 * The permission rules of a settings view as the rules module reads them, so a host that rebuilds
 * its permissions for each run (a new view, a new trust answer) needs no table of its own. Settings
 * and rules are one layer and never import each other (docs/ARCHITECTURE.md, "Layers"); this
 * joins them from above.
 */
export interface PermissionRuleFacts {
  /** The user's trust decision for the folder of a repository file (`permissionRuleLists`). */
  readonly trusted: ScopeTrust;
  readonly local: LocalFileFacts;
  /** The `--settings` file as the host names it (a path, or the inline JSON's label). */
  readonly flagSettings: string;
}

export interface PermissionRulesOf {
  /** Every rule that applies, deny first, then ask, then allow; each with the source of its file. */
  readonly rules: readonly PermissionRule[];
  readonly directories: readonly AddedDirectory[];
  /** What the rules parser says about a rule it skips or ignores, each path led by the scope. */
  readonly issues: readonly PluginIssue[];
}

/**
 * Where each scope's rules were written, in the rules module's terms (permissions.md, "Settings
 * precedence" and "Managed settings"). The host's parent settings are the embedder's managed
 * policy. A `--add-dir` directory carries no permission rule, so it has no source.
 */
const SOURCE_OF: {
  readonly [S in PolicyScope]: (facts: PermissionRuleFacts) => RuleSource | undefined;
} = {
  managed: () => ({ kind: 'managed' }),
  parent: () => ({ kind: 'embedder-managed' }),
  flag: (facts) => ({ kind: 'flag-settings', file: facts.flagSettings }),
  local: () => ({ kind: 'local' }),
  project: () => ({ kind: 'project' }),
  user: () => ({ kind: 'user' }),
  addDir: () => undefined,
};

const BEHAVIORS = ['deny', 'ask', 'allow'] as const;

export function permissionRulesOf(view: PolicyView, facts: PermissionRuleFacts): PermissionRulesOf {
  const lists = permissionRuleLists(view, facts.trusted, facts.local);
  const parsed = BEHAVIORS.flatMap((behavior) =>
    lists[behavior].flatMap((entry) => {
      const source = SOURCE_OF[entry.scope](facts);
      if (source === undefined) return [];
      const read = parseRule(entry.rule, { behavior, source });
      return [{ scope: entry.scope, read }];
    }),
  );
  return {
    rules: parsed.flatMap(({ read }) => (read.rule === undefined ? [] : [read.rule])),
    directories: lists.additionalDirectories,
    issues: parsed.flatMap(({ scope, read }) =>
      read.issues.map((issue) => ({ ...issue, path: `${scope}:${issue.path}` })),
    ),
  };
}
