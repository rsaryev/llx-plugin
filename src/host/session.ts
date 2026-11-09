import { agentsForView, createSessionContent, type SessionContent } from './session-content.ts';
import type { AgentPart } from './session-agents.ts';
import { entriesOf } from './session-skill-entries.ts';
import type { HostStateCell } from './state.ts';
import { createComponentPart, type ComponentPart } from './session-components.ts';
import { createSessionCore, type SessionCore } from './session-core.ts';
import { createTurnScope, type HookScope, type TurnScope } from './session-hook-scope.ts';
import { createHookPart, type HookPart } from './session-hooks.ts';
import { createMentionPart, type MentionPart } from './session-mentions.ts';
import { createSkillPart, type SkillPart } from './session-skills.ts';
import { createToolCheckPart, type ToolCheckPart } from './session-tool-check.ts';
import type { SessionOptions } from './session-types.ts';
import { applyTurn, type TurnOptions } from './turn.ts';

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
  TurnPart &
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
  const next = (turn: TurnOptions) => {
    const changed = applyTurn(optionsOf(), turn);
    const folders = turn.cwd === undefined ? content : createSessionContent(core.cell, changed);
    return { options: changed, content: folders };
  };
  return {
    ...skillPart,
    ...createMentionPart(core, options, skillPart, () => [
      ...entriesOf(core.cell.current()),
      ...content.folders.current(),
    ]),
    ...part,
    ...createToolCheckPart(part),
    get hookEnvironment() {
      return part.hookEnvironment;
    },
    ...createComponentPart(core, agents),
    reloadAgents: (reload) => agents.reloadAgents(reload),
    agentCatalog: (overrides) => agents.agentCatalog(overrides),
    selectAgent: (choice, overrides) => agents.selectAgent(choice, overrides),
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

export function openSession(cell: HostStateCell, options: SessionOptions): PluginSession {
  return viewOf(createSessionCore(cell), { options, content: createSessionContent(cell, options) });
}
