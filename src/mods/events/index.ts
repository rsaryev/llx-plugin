import type { z } from 'zod';
import type { EventRules } from '../types.ts';
import { AGENT_SPECS } from './agent.ts';
import { ATTRIBUTION_SPEC } from './attribution.ts';
import { COMMAND_SPECS } from './command.ts';
import { CONFIG_SPECS } from './config.ts';
import { PROMPT_SPECS } from './prompt.ts';
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

/** The first problem a zod check found, as one phrase: `decision: Invalid option`. */
function describe(error: z.ZodError): string {
  const [first] = error.issues;
  if (!first) return 'does not fit';
  const where = first.path.join('.');
  return where === '' ? first.message : `${where}: ${first.message}`;
}

/**
 * Why a hook's result does not fit what `event` answers (the "A hook can return" column), or
 * `undefined` when it fits or the event is not one of this part's. The wording is the kit's.
 */
export function eventResultProblem(
  event: string,
  result: unknown,
  answered = false,
): string | undefined {
  const spec = specOf(event);
  if (!spec) return undefined;
  const parsed = spec.result.safeParse(result);
  if (!parsed.success) return `${event} result: ${describe(parsed.error)}`;
  return answered ? spec.answeredProblem?.(result) : undefined;
}

/** Why an event fired with `input` does not fit the fields the docs name on it, or `undefined`. */
export function eventInputProblem(event: string, input: unknown): string | undefined {
  const parsed = specOf(event)?.input.safeParse(input);
  return parsed && !parsed.success ? `${event} input: ${describe(parsed.error)}` : undefined;
}

/**
 * The rules the chain takes (`createModChain({ clock, rules })`): the shape of what each event
 * answers, the changes to an event that are refused, what Claude Code's own behaviour receives, and
 * a reason cut at 4,096 characters.
 */
export function createEventRules(): EventRules {
  return {
    shapeProblem: eventResultProblem,
    changeProblem: (event, original, changed) => specOf(event)?.changeProblem?.(original, changed),
    coreInput: (event, original, passed) => specOf(event)?.coreInput?.(original, passed) ?? passed,
    settle: (event, result) => specOf(event)?.settle?.(result) ?? result,
  };
}

export { autocompleteRows } from './autocomplete.ts';
export type { AutocompleteRow } from './prompt.ts';
export { clampReason } from './reasons.ts';
export { SESSION_END_REASONS } from './session.ts';
export { skillPromptEvent, type SkillPromptEvent, type SkillSource } from './skill-prompt-event.ts';
export { mergeToolCheck, type ToolCheckContext, type ToolDecision } from './tool-check-merge.ts';
export type { EventSpec } from './spec.ts';
