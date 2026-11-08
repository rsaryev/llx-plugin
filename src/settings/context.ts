/**
 * Facts about the session and the account that some keys depend on, supplied by the host as plain
 * data (not a port: nothing here is an effect). The kit reads no `process.env` and calls no
 * account API; where Anthropic's own list or an admin toggle decides, the host says what it is.
 */
export interface PolicyContext {
  /** The account type the session is signed in with: `channelsEnabled` and the plan defaults read it. */
  readonly account: 'claudeaiTeamEnterprise' | 'claudeaiPersonal' | 'console';
  /** Signed in on a Pro plan (workflows default off, the size guideline defaults to `small`). */
  readonly planIsPro: boolean;
  /** Any administrator source is present (managed settings file, MDM, server-managed). */
  readonly hasManagedSettings: boolean;
  /** `parentSettingsBehavior` is `merge`: the embedding host's settings join the managed tier. */
  readonly parentMerge: boolean;
  /** Whether the user accepted the workspace trust dialog for a folder's scope. */
  readonly isFolderTrusted: (scope: 'project' | 'local' | 'addDir') => boolean;
  /** Values of environment variables the policy reads, copied in by the host. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Anthropic's default channel allowlist: not in the docs, so the host supplies it. */
  readonly defaultChannelAllowlist: readonly {
    readonly marketplace: string;
    readonly plugin: string;
  }[];
  /** Names of Anthropic's official marketplaces, for example `claude-plugins-official`. */
  readonly officialMarketplaces: readonly string[];
  /** The claude.ai admin toggle that turns workflows off for an organization. */
  readonly orgWorkflowsOff?: boolean;
}
