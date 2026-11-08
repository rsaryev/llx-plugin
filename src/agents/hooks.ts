import type { AgentRecord, AgentSource } from '../format/agent-record.ts';
import { matchesMatcher, type MatcherMode } from '../rules/hook-matcher.ts';
import type { HookMatcherGroup, HooksSettings } from '../protocol/hook-config.ts';
import type { HookEvent } from '../protocol/official.ts';

/**
 * The hooks an agent's frontmatter defines, and which of them fire (sub-agents.md, "Hooks in
 * subagent frontmatter"). The kit selects; running them is the hooks engine's. It returns only the
 * agent's own groups: "in the main-session case they run alongside any hooks defined in
 * `settings.json`", so the host merges them with the settings' groups.
 */

/** How the agent runs: "spawned as a subagent" or "as the main session via `--agent`". */
export type AgentRunKind = 'subagent' | 'main-session';

type HookSource = Pick<AgentRecord, 'hooks' | 'source'>;

/**
 * "When the agent is invoked as a subagent, `Stop` hooks in frontmatter are automatically
 * converted to `SubagentStop` events." The converted groups follow the file's own `SubagentStop`
 * groups (judgment: the docs give no order). `Stop` has no matcher input, so a `matcher` written
 * there is ignored (hooks.md, "Matcher patterns"); it is dropped in the conversion, or it would
 * start to filter on the agent type once the event is `SubagentStop` (judgment).
 */
function stopToSubagentStop(hooks: HooksSettings): HooksSettings {
  const { Stop: stop, SubagentStop: own, ...rest } = hooks;
  if (stop === undefined) return hooks;
  const converted = stop.map((group): HookMatcherGroup => ({ hooks: group.hooks }));
  return { ...rest, SubagentStop: [...(own ?? []), ...converted] };
}

const KEEP_AS_WRITTEN = (hooks: HooksSettings): HooksSettings => hooks;

const RUN: { readonly [R in AgentRunKind]: (hooks: HooksSettings) => HooksSettings } = {
  subagent: stopToSubagentStop,
  'main-session': KEEP_AS_WRITTEN,
};

/** Whether a source's frontmatter hooks apply at all: "Ignored for plugin subagents". */
const HOOKS_APPLY: { readonly [S in AgentSource]: boolean } = {
  managed: true,
  flag: true,
  project: true,
  user: true,
  plugin: false,
};

/**
 * What the agent's hooks are for this run. A plugin agent has none: Claude Code ignores `hooks`
 * "for security reasons" (the reader already drops them, and this holds for a record built another
 * way). The record is not changed.
 */
export function agentHookGroups(agent: HookSource, run: AgentRunKind): HooksSettings {
  if (!HOOKS_APPLY[agent.source] || agent.hooks === undefined) return {};
  return RUN[run](agent.hooks);
}

/**
 * Which sources need the folder the agent file came from to be trusted: only a project-level agent
 * (which here also stands for an `--add-dir` one). "Hooks from user-level subagents in
 * `~/.claude/agents/` and from definitions you pass with `--agents` run without this step"; managed
 * agents are exempt too (judgment: organization-installed, never from a folder being opened).
 */
const NEEDS_TRUST: { readonly [S in AgentSource]: boolean } = {
  managed: false,
  flag: false,
  project: true,
  user: false,
  plugin: false,
};

/**
 * "Until you trust the folder, the subagent still runs, but Claude Code skips its frontmatter
 * hooks." `folderTrusted` is the host's one answer to "did the user accept the trust dialog for
 * this very folder": a parent folder's trust and a `-p` session do not make it true, which is why
 * the kit does not compute it.
 */
export function hooksTrustGate(
  source: AgentSource,
  folderTrusted: boolean,
): 'run' | 'skip-untrusted' {
  return NEEDS_TRUST[source] && !folderTrusted ? 'skip-untrusted' : 'run';
}

/**
 * How an event's matcher is read (hooks.md, "Matcher patterns"): `none` for the events that "have no
 * matcher support" and fire on every occurrence; `narrow` for `FileChanged` and `StopFailure`; every
 * other event matches its own input with the standard grammar. A table over `HookEvent`, so an event
 * added by the SDK fails the typecheck until it has a row.
 */
const MATCHING: { readonly [E in HookEvent]: MatcherMode | 'none' } = {
  PreToolUse: 'standard',
  PostToolUse: 'standard',
  PostToolUseFailure: 'standard',
  PostToolBatch: 'none',
  Notification: 'standard',
  UserPromptSubmit: 'none',
  UserPromptExpansion: 'standard',
  SessionStart: 'standard',
  SessionEnd: 'standard',
  Stop: 'none',
  StopFailure: 'narrow',
  SubagentStart: 'standard',
  SubagentStop: 'standard',
  PreCompact: 'standard',
  PostCompact: 'standard',
  PreModelSwitch: 'standard',
  PostModelSwitch: 'standard',
  PermissionRequest: 'standard',
  PermissionDenied: 'standard',
  Setup: 'standard',
  TeammateIdle: 'none',
  TaskCreated: 'none',
  TaskCompleted: 'none',
  Elicitation: 'standard',
  ElicitationResult: 'standard',
  ConfigChange: 'standard',
  WorktreeCreate: 'none',
  WorktreeRemove: 'none',
  InstructionsLoaded: 'standard',
  CwdChanged: 'none',
  FileChanged: 'narrow',
  DirectoryAdded: 'standard',
  MessageDisplay: 'none',
};

const groupMatches = (group: HookMatcherGroup, event: HookEvent, value: string | undefined) => {
  const mode = MATCHING[event];
  return mode === 'none' || matchesMatcher(group.matcher, value, mode);
};

export interface AgentHookSelection {
  /** The groups to run, in the order the file lists them. */
  readonly groups: readonly HookMatcherGroup[];
  /** Why an agent that has hooks selected none: not active, or its folder is not trusted. */
  readonly skipped?: 'untrusted' | 'inactive';
}

export interface AgentHookContext {
  readonly run: AgentRunKind;
  /** The event that occurred; for a subagent's `Stop`, `SubagentStop`. */
  readonly event: HookEvent;
  /** The event's matcher input (the tool name, the agent type, ...); none for `Stop`. */
  readonly matcherValue: string | undefined;
  /** "These hooks only run while that specific subagent is active." */
  readonly active: boolean;
  /** See `hooksTrustGate`. */
  readonly folderTrusted: boolean;
}

/**
 * The groups of the agent's frontmatter that fire for one occurrence of an event. Judgments: an
 * inactive agent is reported before an untrusted one, and a skip is reported only for an agent
 * that has hooks, so the host logs the trust error only where hooks were lost.
 */
export function selectAgentHooks(agent: HookSource, ctx: AgentHookContext): AgentHookSelection {
  const all = agentHookGroups(agent, ctx.run);
  if (Object.keys(all).length === 0) return { groups: [] };
  if (!ctx.active) return { groups: [], skipped: 'inactive' };
  if (hooksTrustGate(agent.source, ctx.folderTrusted) === 'skip-untrusted') {
    return { groups: [], skipped: 'untrusted' };
  }
  const groups = (all[ctx.event] ?? []).filter((group) =>
    groupMatches(group, ctx.event, ctx.matcherValue),
  );
  return { groups };
}
