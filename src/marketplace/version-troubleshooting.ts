import { isWritableScope, type InstallScope } from './install-scopes.ts';

/**
 * The way out of `Version: unknown` for a plugin installed from a git repository (plugins/
 * troubleshooting.md, "A plugin installed from a git repository shows version `unknown`"): Claude
 * Code could not read the commit it uses as the plugin's version. The four steps are the section's,
 * with the commands as it writes them; the plan is data a host shows or runs.
 */

export interface VersionStep {
  readonly command: string;
  /** Set on the step that needs a Claude Code release: the first release that clones in a readable format. */
  readonly minimumClaudeCode?: string;
}

export interface UnknownVersionPlan {
  readonly steps: readonly VersionStep[];
  /** `claude plugin update` "changes one scope's block per run": one rerun for each block still showing `unknown`. */
  readonly rerun: readonly { readonly scope: InstallScope; readonly command: string }[];
}

/** "v2.1.302 or later, which clones in a format it can read the commit from". */
const MINIMUM_CLAUDE_CODE = '2.1.302';

/** A plugin as `<name>@<marketplace>`: the two parts the commands use, never split out of one string. */
export interface PluginRef {
  readonly name: string;
  readonly marketplace: string;
}

/**
 * The steps for a plugin and the scopes of the blocks that still show `unknown` afterwards. The
 * plugin is given as its two parts, so the marketplace of step 2 is always the plugin's own.
 * Judgments: a managed scope gets no rerun, as the user cannot update it; a scope listed twice is
 * rerun once.
 */
export function unknownVersionSteps(
  plugin: PluginRef,
  unknownScopes: readonly InstallScope[],
): UnknownVersionPlan {
  const id = `${plugin.name}@${plugin.marketplace}`;
  return {
    steps: [
      { command: 'claude update', minimumClaudeCode: MINIMUM_CLAUDE_CODE },
      { command: `claude plugin marketplace update ${plugin.marketplace}` },
      { command: `claude plugin update ${id}` },
      { command: 'claude plugin list' },
    ],
    rerun: [...new Set(unknownScopes)].filter(isWritableScope).map((scope) => ({
      scope,
      command: `claude plugin update ${id} --scope ${scope}`,
    })),
  };
}
