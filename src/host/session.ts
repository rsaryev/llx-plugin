import { agentsForView, createSessionContent, type SessionContent } from './session-content.ts';
import type { AgentPart } from './session-agents.ts';
import { sessionStateSource, type HostStateSource } from './state.ts';
import { createComponentPart, type ComponentPart } from './session-components.ts';
import {
  createSessionCore,
  monitorLedgerFor,
  rememberLedger,
  type SessionCore,
} from './session-core.ts';
import { environmentFor } from './session-environment.ts';
import { createTurnScope, type HookScope, type TurnScope } from './session-hook-scope.ts';
import { createHookPart, type HookPart } from './session-hooks.ts';
import { createMentionPart, type MentionPart } from './session-mentions.ts';
import { createMonitorPart, type MonitorPart } from './session-monitors.ts';
import { createSkillPart, type SkillPart } from './session-skills.ts';
import { toolNamesOf } from '../rules/index.ts';
import { createToolCheckPart, type ToolCheckPart } from './session-tool-check.ts';
import type { SessionOptions } from './session-types.ts';
import type { HostedPlugin } from './types.ts';
import type { PluginIssue } from '../format/issues.ts';
import { applyTurn, type TurnOptions } from './turn.ts';

/** The plugins this session knows: the host's with its own (`SessionOptions.plugins`), as its settings decide. */
export interface PluginListPart {
  /** The host's plugins and the session's own, with whether each runs in this session; live. */
  readonly plugins: readonly HostedPlugin[];
  /** What was found wrong with this session's plugin set (name conflicts, duplicate ids, readings); live. */
  readonly issues: readonly PluginIssue[];
}

export interface TurnPart {
  /**
   * The same session for one turn: a view that shares the hooks registered so far, the limits on
   * skill hooks and the `once` keys already consumed, and replaces only the fields `turn` names.
   * It never reopens the session, and the session it is called on does not change; calling it on a
   * view builds on that view's fields.
   */
  withTurn(turn: TurnOptions): PluginSession;
  /**
   * `withTurn` for one run of the host: calls `run` with the view of the turn, and when `run`
   * settles (returns or throws) drops the hooks that view and the views made from it registered
   * with `lifetime: 'turn'`. The result of `run` is returned.
   */
  runScoped<T>(turn: TurnOptions, run: (turn: PluginSession) => Promise<T>): Promise<T>;
}

/**
 * One session over the host's plugins: what to list and expand, the hooks to dispatch, and the
 * components to resolve. Each part is its own file; this only puts them together.
 */
export type PluginSession = SkillPart &
  MentionPart &
  HookPart &
  ToolCheckPart &
  HookScope &
  ComponentPart &
  MonitorPart &
  TurnPart &
  PluginListPart &
  Omit<AgentPart, 'pluginOf'>;

/**
 * The session over a core for the given options: `openSession` makes the core, `withTurn` reuses
 * it. A view holds the core, never a state: what the host holds now is read at each use.
 */
function viewOf(
  core: SessionCore,
  context: { readonly options: SessionOptions; readonly content: SessionContent },
  scope?: TurnScope,
): PluginSession {
  const { options, content } = context;
  const optionsOf = () => ({ ...options, cwd: content.directories.cwd() });
  const { part, skills } = createHookPart(core, optionsOf, scope);
  const skillPart = createSkillPart(core, options, { registrar: skills, content });
  const agents = agentsForView(content.agents, options);
  // A turn in the session's own cwd is the same session: its folders stay. One that moves the cwd
  // reads the folders of its cwd, with the directories added so far.
  const next = (turn: TurnOptions) => {
    const added = { addedDirectories: content.directories.added() };
    const changed = applyTurn({ ...optionsOf(), ...added }, turn);
    const moved = changed.cwd !== content.directories.cwd();
    return {
      options: changed,
      content: moved ? createSessionContent(core.cell, changed) : content,
    };
  };
  return {
    ...skillPart,
    ...createMentionPart(core, options, skillPart),
    ...part,
    ...createToolCheckPart(part, () => toolNamesOf(options.toolNames)),
    get plugins() {
      return core.cell.current().all;
    },
    get issues() {
      return core.cell.current().issues;
    },
    get hookEnvironment() {
      return environmentFor(core, optionsOf());
    },
    ...createComponentPart(core, optionsOf, agents),
    ...createMonitorPart(core, optionsOf),
    reloadAgents: (reload) => agents.reloadAgents(reload),
    agentCatalog: (overrides) => agents.agentCatalog(overrides),
    selectAgent: (choice, overrides) => agents.selectAgent(choice, overrides),
    pluginDefaults: () => agents.pluginDefaults(),
    subagentStatusLine: (facts) => agents.subagentStatusLine(facts),
    withTurn: (turn) => viewOf(core, next(turn), scope),
    async runScoped(turn, run) {
      const own = createTurnScope();
      try {
        return await run(viewOf(core, next(turn), own));
      } finally {
        own.end();
      }
    },
  };
}

export function openSession(host: HostStateSource, options: SessionOptions): PluginSession {
  const cell = sessionStateSource(host, options);
  const monitors = monitorLedgerFor(options.parentSession, options.monitorLedger);
  const core = createSessionCore(cell, monitors);
  const session = viewOf(core, { options, content: createSessionContent(cell, options) });
  rememberLedger(session, monitors);
  return session;
}
