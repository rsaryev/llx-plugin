/**
 * The plugins the auto-update pass leaves alone (plugins/loading.md, "Which marketplaces and
 * plugins auto-update": "Auto-update also skips a plugin whose marketplace entry declares a
 * `headersHelper`"; "When a command source re-runs": a command source "doesn't wait for the
 * auto-update pass"; plugins/host-marketplace.md, "Installs and updates that refuse a command instead
 * of asking": a background auto-update "lists the plugin in the `/plugin` Errors tab").
 */

export interface AutoUpdateCandidate {
  /** The marketplace entry declares a `headersHelper` command. */
  readonly headersHelper?: string;
  /** The plugin has a `command` source; `accepted` says the user accepted the command it now declares. */
  readonly commandSource?: { readonly accepted: boolean };
}

export type SkippedBy = 'headers-helper' | 'command-needs-acceptance' | 'command-source';

export type AutoUpdateSkip =
  | { readonly skipped: false }
  | {
      readonly skipped: true;
      readonly reason: SkippedBy;
      /** The user is told in the Errors tab to install or update it by hand. */
      readonly listedInErrorsTab: boolean;
    };

const skip = (reason: SkippedBy, listedInErrorsTab: boolean): AutoUpdateSkip => ({
  skipped: true,
  reason,
  listedInErrorsTab,
});

/**
 * Whether the pass skips the plugin. Judgment (spec/judgments.md): a command source the user
 * accepted is skipped because its command re-runs on its own schedule; one whose command changed or
 * was never accepted is listed in the Errors tab, like a `headersHelper` plugin.
 */
export function pluginSkippedByAutoUpdate(candidate: AutoUpdateCandidate): AutoUpdateSkip {
  if (candidate.headersHelper !== undefined) return skip('headers-helper', true);
  const { commandSource } = candidate;
  if (commandSource === undefined) return { skipped: false };
  return commandSource.accepted
    ? skip('command-source', false)
    : skip('command-needs-acceptance', true);
}
