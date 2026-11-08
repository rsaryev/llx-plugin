import type { HookHandler } from '../protocol/hook-config.ts';
import type { HookInputOf } from '../protocol/hook-events.ts';
import type { BaseHookInput, HookEvent, SettingSource } from '../protocol/official.ts';
import type { PluginIssue } from '../format/issues.ts';

/**
 * The shapes the hook engine's stages share (docs/ARCHITECTURE.md, "Homes shared between streams"),
 * so the stages build apart and meet here. Only types: no behaviour lives in this file.
 */

/** Where a registered handler was declared (hooks.md, "Hook locations"). */
export type HookSourceKind = 'settings' | 'plugin' | 'skill' | 'agent' | 'session';

export interface HookSource {
  readonly kind: HookSourceKind;
  /** What an ask prompt and the `/hooks` list call it: `[settings]`, `[plugin:<name>]`, `[skill]`. */
  readonly label: string;
  readonly pluginName?: string;
  /** Which settings file, skill folder or agent folder it came from (official). */
  readonly scope?: SettingSource;
  /** Declared in managed policy settings (hooks.md, "Disable or remove hooks"). */
  readonly managed?: boolean;
}

export interface RegisteredHandler {
  /** Stable key a session uses to remove the handler (`once`). */
  readonly id: string;
  readonly event: HookEvent;
  /** The matcher of the group the handler was declared in. */
  readonly matcher?: string;
  /** Official shape. */
  readonly handler: HookHandler;
  readonly source: HookSource;
  readonly pluginId?: string;
}

/** What is installed: pure and immutable, built by the host from enabled plugins, settings, skills and agents. */
export interface HookRegistry {
  readonly entries: readonly RegisteredHandler[];
  with(entries: readonly RegisteredHandler[]): HookRegistry;
  without(ids: readonly string[]): HookRegistry;
}

/**
 * The input fields only an event has: the official input minus what every event shares. A shared
 * field an event narrows from optional to required stays, because it is the event's own: the
 * `agent_id` and `agent_type` of `SubagentStart` and `SubagentStop`, which the matcher filters on
 * (hooks.md, "SubagentStart").
 */
type OptionalSharedKeys = {
  [K in keyof BaseHookInput]-?: object extends Pick<BaseHookInput, K> ? K : never;
}[keyof BaseHookInput];
type SharedFields = Exclude<keyof BaseHookInput, OptionalSharedKeys> | 'hook_event_name';
type EventFields<I> = {
  [
    K in keyof I as K extends SharedFields
      ? never
      : K extends OptionalSharedKeys
        ? undefined extends I[K]
          ? never
          : K
        : K
  ]: I[K];
};
export type EventFactsOf<E extends HookEvent> = EventFields<HookInputOf<E>>;

/** What the host knows about the running session, beside the event. */
export interface HookSession {
  readonly sessionId: string;
  readonly transcriptPath: string;
  readonly cwd: string;
  /**
   * The mode as the host names it, including the label **Manual** (hooks.md, "Common input
   * fields"): the input carries it as `"default"`, and a text that names no mode is not sent.
   */
  readonly permissionMode?: string;
  readonly effort?: BaseHookInput['effort'];
  readonly promptId?: string;
  readonly scratchpadDir?: string;
  readonly agent?: { readonly id?: string; readonly type?: string };
  readonly interactive: boolean;
  /**
   * Settings-file hooks may run (hooks.md, "Workspace trust"): an interactive session after the
   * trust dialog, a `-p` or SDK session always, because it never shows the dialog.
   */
  readonly trusted: boolean;
  /**
   * The trust dialog was accepted for the exact folder, which a project subagent's frontmatter
   * hooks need and a `-p` session never satisfies (hooks.md, "Hooks in skills and agents").
   */
  readonly folderTrustAccepted?: boolean;
  /**
   * `effective` is the `disableAllHooks` left after settings precedence, which turns off every hook
   * but the managed ones; `managedLocked` is `disableAllHooks` set at the managed level, which
   * turns off those too (hooks.md, "Disable or remove hooks").
   */
  readonly disableAllHooks: { readonly effective: boolean; readonly managedLocked: boolean };
  /** The plugins that are enabled; absent means the registry holds only enabled plugins' hooks. */
  readonly enabledPlugins?: ReadonlySet<string>;
  /**
   * `allowManagedHooksOnly` is set in managed settings: only managed hooks, the SDK's own and
   * those of plugins force-enabled in managed `enabledPlugins` run (hooks.md, "Hook locations").
   */
  readonly allowManagedHooksOnly?: boolean;
  /**
   * The full `plugin@marketplace` ids force-enabled in managed `enabledPlugins`, which stay exempt
   * under `allowManagedHooksOnly`; a plugin of the same name from another marketplace does not.
   */
  readonly forceEnabledPlugins?: ReadonlySet<string>;
  /**
   * `strictPluginOnlyCustomization` locks the `hooks` surface (`true`, or an array naming
   * `"hooks"`): user, project and local settings hooks and the frontmatter hooks of user and
   * project skills and agents stop (hooks.md, "Hook locations" and "Limits on skill hooks").
   */
  readonly pluginOnlyHooks?: boolean;
  /** The host's MCP clients are connected: what the run stage needs to call an `mcp_tool` hook. */
  readonly mcpAvailable: boolean;
  readonly userConfig?: Readonly<Record<string, string>>;
}

/** A tool call as a hook's `if` reads it. */
export interface ToolCallView {
  readonly toolName: string;
  readonly toolInput: unknown;
}

/** The canonical name of a model (hooks.md, "PreModelSwitch"); the host knows its models. */
export interface ModelCatalog {
  /** `undefined` when the id has no canonical name, as a custom id only a gateway knows. */
  canonicalModel(id: string): string | undefined;
}

/** How a Monitor call reached a hook through a `Bash` matcher or its own (hooks.md, "Match Monitor commands"). */
export interface MonitorTreatment {
  /** Matched only because the matcher is a `Bash` matcher: the hook gets a Bash call. */
  readonly asBash: boolean;
  /** The hook's `allow` and `updatedInput` apply to the Monitor call. */
  readonly effectsApply: boolean;
}

/** What the select stage returns. */
export interface Selection {
  /** In registry order. */
  readonly selected: readonly RegisteredHandler[];
  readonly issues: readonly PluginIssue[];
  /** Only for a Monitor call on `PreToolUse` or `PermissionRequest`. */
  readonly monitor: ReadonlyMap<RegisteredHandler, MonitorTreatment>;
}
