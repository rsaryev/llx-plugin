/**
 * The texts of repository plugins (plugins/loading.md, "Trust check and component limits for
 * repository plugins" and "Check why a repository plugin didn't load"). The docs quote no message for
 * a skipped monitor or bundle; the wording is the kit's (spec/judgments.md).
 */
import type { SkillsDirBlock } from './repository-types.ts';
import {
  decideRepositoryPlugin,
  isRepositorySupplied,
  repositoryCauses,
  type RepositoryDecision,
  type RepositoryPluginFacts,
  type RepositoryReason,
} from './repository-trust.ts';

export const MONITORS_NOT_LOADED = 'Background monitors do not load from a repository plugin';

export const BUNDLES_NOT_LOADED =
  'a repository plugin cannot load an MCP bundle: declare the server inline or in a .mcp.json inside the plugin directory';

/** What the docs say about each cause (plugins/loading.md, "Check why a repository plugin didn't load"). */
const MANAGED_CAUSE: { readonly [B in SkillsDirBlock]: string } = {
  strictPluginOnlyCustomization:
    'customization is locked to plugins (strictPluginOnlyCustomization), which skips the whole skills-directory plugin when any one kind is locked',
  strictKnownMarketplaces:
    'the marketplace allowlist (strictKnownMarketplaces) has no { "source": "skills-dir" } entry',
  blockedMarketplaces:
    'the marketplace blocklist (blockedMarketplaces) names { "source": "skills-dir" }',
};

const MANAGED_TAIL =
  '/plugin and `claude plugin list` show no plugin and no error for a skipped folder; run /status and look for `Enterprise managed settings` on the `Setting sources` line';

const TRUST_CAUSE = (facts: RepositoryPluginFacts): string => {
  const extra = facts.nonInteractive
    ? ' (a `claude -p` or SDK run never shows the dialog, so it is no substitute)'
    : facts.parentTrusted
      ? ' (trusting a parent folder is not enough)'
      : '';
  return `the folder is not trusted: the plugin loads only after you accept the workspace trust dialog for that folder${extra}`;
};

/** One sentence per cause, the same wording whichever origin; `undefined` for a plugin that loads. */
const CAUSES: {
  readonly [R in RepositoryReason]: (facts: RepositoryPluginFacts) => string | undefined;
} = {
  trusted: () => undefined,
  'user-level': () => undefined,
  'blocked-by-managed-settings': (facts) =>
    facts.managedBlock === undefined
      ? undefined
      : `${MANAGED_CAUSE[facts.managedBlock]}; ${MANAGED_TAIL}`,
  'not-primary-directory': () =>
    "the session did not start where the plugin is: Claude Code reads the .claude/skills/ of the session's primary working directory and does not search parent directories for plugins; launch from the repository root, or move the session there with /cd (v2.1.246 or later)",
  'folder-not-trusted': TRUST_CAUSE,
};

export const WORKTREE_NOTE =
  "in a worktree the plugin loads from the main checkout's .claude/skills/ rather than the worktree's";

export interface RepositoryExplanation {
  readonly decision: RepositoryDecision;
  /** Why it did not load: one sentence per cause that applies, in the decision's order. */
  readonly causes: readonly string[];
  /** What else is worth knowing: where the plugin was read from. */
  readonly notes: readonly string[];
}

/** The decision of `decideRepositoryPlugin` and, when the plugin did not load, every cause in words. */
export function explainRepositoryPlugin(facts: RepositoryPluginFacts): RepositoryExplanation {
  return {
    decision: decideRepositoryPlugin(facts),
    causes: repositoryCauses(facts).flatMap((reason) => CAUSES[reason](facts) ?? []),
    notes: facts.worktree && isRepositorySupplied(facts.origin) ? [WORKTREE_NOTE] : [],
  };
}
