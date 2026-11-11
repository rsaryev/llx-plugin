/**
 * "Plugin doesn't appear or its skills don't show up" (plugins/troubleshooting.md): the three checks, in
 * the docs' order, and what to do next. Pure over what the host can read.
 */

export interface MissingPluginFacts {
  readonly installed: boolean;
  readonly enabled: boolean;
  /** The Errors tab holds entries for the plugin. */
  readonly errors: readonly string[];
  /** Installed during this session, not yet reloaded. */
  readonly installedThisSession: boolean;
  /** Whose plugin it is, for the last step. */
  readonly ownPlugin: boolean;
}

export type Step =
  | { readonly step: 'confirm-installed-and-enabled'; readonly where: string }
  | { readonly step: 'read-errors-tab'; readonly errors: readonly string[] }
  | { readonly step: 'reload'; readonly command: '/reload-plugins' }
  | { readonly step: 'own-plugin'; readonly see: 'Plugin loads but its skills are missing' }
  | { readonly step: 'someone-elses-plugin'; readonly look: string };

/** The next step: the first check that fails, else what to do when the plugin loads with no error and still shows no skills. */
export function nextStep(facts: MissingPluginFacts): Step {
  if (!facts.installed || !facts.enabled) {
    return {
      step: 'confirm-installed-and-enabled',
      where: '/plugin Installed tab, or `claude plugin list` (Status: ✔ enabled)',
    };
  }
  if (facts.errors.length > 0) return { step: 'read-errors-tab', errors: facts.errors };
  if (facts.installedThisSession) return { step: 'reload', command: '/reload-plugins' };
  return facts.ownPlugin
    ? { step: 'own-plugin', see: 'Plugin loads but its skills are missing' }
    : {
        step: 'someone-elses-plugin',
        look: "the plugin's details pane under Installed in /plugin, which lists what it contains",
      };
}
