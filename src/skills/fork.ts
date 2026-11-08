import { error, type PluginIssue } from '../format/issues.ts';
import type { Execution } from './execution.ts';

/**
 * What a forked skill starts (skills.md, "Run skills in a subagent": "Claude Code starts a new
 * subagent of the type set in the `agent` field and gives it the skill content as its prompt. The
 * subagent doesn't see your conversation history"; the table: system prompt "From agent type", task
 * "SKILL.md content", also loads "CLAUDE.md, per the agent's startup context"). The agent catalog is
 * `agents`, a module of the same layer, so the host passes what it knows of an agent type in.
 */

/** What a subagent loads when it starts (sub-agents.md, "What loads at startup"). */
export interface ForkStartContext {
  readonly claudeMd: boolean;
  readonly gitStatus: boolean;
}

/** The host's catalog: the startup context of a subagent type, or `undefined` when no such agent exists. */
export type ForkAgents = (agent: string) => ForkStartContext | undefined;

type ForkExecution = Extract<Execution, { readonly mode: 'fork' }>;

export interface ForkLaunch {
  /** The subagent type that runs the skill. */
  readonly agent: string;
  /** The skill's rendered content: the whole of what the subagent is asked to do. */
  readonly task: string;
  /** The subagent's system prompt is its type's, not the skill's. */
  readonly systemPrompt: 'agent-type';
  /** What the agent type loads beside the task: `Explore` and `Plan` start without CLAUDE.md and git status. */
  readonly loads: ForkStartContext;
  readonly background: boolean;
  /** A foreground (waiting) fork keeps the full tool set; a background one gets the narrower set. */
  readonly fullToolSet: boolean;
  readonly seesConversation: false;
}

export type ForkResult =
  | { readonly ok: true; readonly launch: ForkLaunch }
  | { readonly ok: false; readonly issue: PluginIssue };

/**
 * The launch of a forked skill. Judgment (spec/judgments.md): an `agent` that is no built-in and no
 * custom agent of the session is an error naming it, not a silent fall-back to `general-purpose`.
 */
export function launchFork(
  execution: ForkExecution,
  command: string,
  text: string,
  agents: ForkAgents,
): ForkResult {
  const loads = agents(execution.agent);
  if (loads === undefined) {
    return {
      ok: false,
      issue: error(
        `/${command}`,
        `The skill runs in the subagent "${execution.agent}", but no built-in or custom subagent has that name`,
      ),
    };
  }
  return {
    ok: true,
    launch: {
      agent: execution.agent,
      task: text,
      systemPrompt: 'agent-type',
      loads,
      background: execution.background,
      fullToolSet: execution.fullToolSet,
      seesConversation: execution.seesConversation,
    },
  };
}
