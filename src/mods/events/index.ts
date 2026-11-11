import type { z } from 'zod';
import type { EventRule, EventRuleBook } from '../types.ts';
import { zodProblem } from '../values.ts';
import { AGENT_SPECS } from './agent.ts';
import { ATTRIBUTION_SPEC } from './attribution.ts';
import { COMMAND_SPECS } from './command.ts';
import { CONFIG_SPECS } from './config.ts';
import { PROMPT_CHANGE_SPEC, PROMPT_SPECS } from './prompt.ts';
import { SESSION_SPECS } from './session.ts';
import { SKILL_PROMPT_SPEC } from './skill.ts';
import type { EventSpec } from './spec.ts';
import { TOOL_SPECS } from './tool.ts';
import { TURN_SPECS } from './turn.ts';

/**
 * The events this part of mods knows (plugins/mods/reference.md, "Events"): tools, prompts,
 * commands and configuration, turns, the session and subagents. The interface, `settings.read`,
 * the mods' own events and telemetry belong to the other parts of mods.
 */
export const EVENT_SPECS = {
  ...TOOL_SPECS,
  ...PROMPT_SPECS,
  'prompt.change': PROMPT_CHANGE_SPEC,
  'skill.prompt': SKILL_PROMPT_SPEC,
  'attribution.text': ATTRIBUTION_SPEC,
  ...COMMAND_SPECS,
  ...CONFIG_SPECS,
  ...TURN_SPECS,
  ...SESSION_SPECS,
  ...AGENT_SPECS,
} as const satisfies Readonly<Record<string, EventSpec>>;

export type SpecifiedEventName = keyof typeof EVENT_SPECS;

/** The fields the docs name on an event's input, as a type. */
export type EventInputOf<N extends SpecifiedEventName> = z.infer<(typeof EVENT_SPECS)[N]['input']>;

const isSpecified = (event: string): event is SpecifiedEventName =>
  Object.hasOwn(EVENT_SPECS, event);

const specOf = (event: string): EventSpec | undefined =>
  isSpecified(event) ? EVENT_SPECS[event] : undefined;

/** Why an event fired with `input` does not fit the fields the docs name on it, or `undefined`. */
export function eventInputProblem(event: string, input: unknown): string | undefined {
  const parsed = specOf(event)?.input.safeParse(input);
  return parsed && !parsed.success ? `${event} input: ${zodProblem(parsed.error)}` : undefined;
}

/**
 * The rule of one event from its spec: a result must fit the "A hook can return" column (the
 * wording is the kit's), and one returned after `next` was answered is checked once more.
 */
function ruleOfSpec(event: string, spec: EventSpec): EventRule {
  const { changeProblem, coreInput, settle } = spec;
  return {
    shapeProblem(result, answered) {
      const parsed = spec.result.safeParse(result);
      if (!parsed.success) return `${event} result: ${zodProblem(parsed.error)}`;
      return answered ? spec.answeredProblem?.(result) : undefined;
    },
    ...(changeProblem ? { changeProblem } : {}),
    ...(coreInput ? { coreInput } : {}),
    ...(settle ? { settle } : {}),
  };
}

/**
 * The rules of this part's events, for the chain (`createModChain({ clock, rules: [EVENT_RULES,
 * ...] })`): the shape of what each event answers, the changes to an event that are refused, what
 * Claude Code's own behaviour receives, and a reason cut at 4,096 characters.
 */
export const EVENT_RULES: EventRuleBook = Object.fromEntries(
  Object.entries(EVENT_SPECS).map(([event, spec]): [string, EventRule] => [
    event,
    ruleOfSpec(event, spec),
  ]),
);

export { autocompleteRows } from './autocomplete.ts';
export type { AutocompleteRow } from './prompt.ts';
export { clampReason, promptDroppedText, withheldResultText, type ToolCallEnd } from './reasons.ts';
export { SESSION_END_REASONS, type SessionEndReason } from '../../protocol/exit-reasons.ts';
export { skillPromptEvent, type SkillPromptEvent, type SkillSource } from './skill-prompt-event.ts';
export {
  hookTightensOnly,
  mergeToolCheck,
  type ToolCheckContext,
  type ToolCheckMode,
  type ToolDecision,
} from './tool-check-merge.ts';
export { INPUT_CHANGED, inputChangedDenial, type InputReview } from './input-review.ts';
export { commandRunEnd, unansweredCommandReply } from './command.ts';
export { toolReadOnlyReport, type ReadOnlyCall, type ReadOnlyChecks } from './read-only.ts';
export type { EventSpec } from './spec.ts';
export { nextTurnText, type NextTurnText, type ResendFacts } from './prompt-cache.ts';
