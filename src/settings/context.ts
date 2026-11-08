import type { ChannelPluginRef } from '../protocol/official.ts';
import type { ChannelAccount } from './channels/channel-gate.ts';
import type { WorkflowSize } from './workflows/size.ts';

/**
 * What a host tells the policy besides the layers: plain data it copies in, so the kit reads no
 * `process.env`, no file and no account. Every field is a fact the docs make a decision depend on and no
 * settings file holds; the comment on each names where.
 */
export interface PolicyContext {
  /** How the session signs in (settings-reference.md, `channelsEnabled` and `prependPlugins`). */
  readonly account: ChannelAccount;
  /** Pro signed in: workflows are off by default and the size guideline is `small` there (`enableWorkflows`). */
  readonly plan: { readonly pro: boolean };
  /** An administrator deploys managed settings on this machine, whether or not the host passed them. */
  readonly hasManagedSettings: boolean;
  /** The administrator set `parentSettingsBehavior: "merge"` (claude-apps-gateway.md). */
  readonly parentMerge: boolean;
  /** Whether the user accepted the workspace trust dialog for the folder of that kind of settings file. */
  readonly isFolderTrusted: (scope: 'project' | 'local' | 'addDir') => boolean;
  /**
   * Git tracks `.claude/settings.local.json`, or `.claude` is a symlink: the file is then
   * repository-supplied and its allow rules and directories wait for the trust dialog (permissions.md,
   * "When your local settings file needs trust"). Defaults to `false`.
   */
  readonly localSettingsTracked?: boolean;
  /** The host's environment: `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS`, `CLAUDE_CODE_DISABLE_WORKFLOWS` (env-vars.md). */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Anthropic's default channel allowlist; "the channel plugins in claude-plugins-official" (channels.md), not listed in the docs. */
  readonly defaultChannelAllowlist: readonly ChannelPluginRef[];
  /** Marketplaces Anthropic runs whose `autoUpdate` defaults on (plugins/loading.md); the docs name only one. */
  readonly officialMarketplaces: readonly string[];
  /** The organization turned workflows off on the Claude Code admin settings page (workflows.md). */
  readonly orgWorkflowsOff?: boolean;
  /** Claude Code was started with `--safe-mode`. Defaults to `false`. */
  readonly safeMode?: boolean;
  /** The Dynamic workflow size choice of `/config`, kept in `~/.claude.json`. */
  readonly workflowSizeChoice?: WorkflowSize;
  /** The session has ultracode on (`/effort ultracode`): the `Large workflow` warning does not show then. */
  readonly ultracode?: boolean;
}
