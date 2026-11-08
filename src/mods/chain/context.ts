import type { Budget } from '../../foundation/index.ts';
import { MOD_LIMITS } from '../../protocol/mods-limits.ts';
import type { Clock } from '../../ports/index.ts';
import type { DispatchOptions, EventRules, HookAccess } from '../types.ts';
import type { ChainEntry } from './registry.ts';

/** What one dispatch of an event shares across the hooks it runs. */
export interface Context {
  readonly name: string;
  readonly options: DispatchOptions;
  readonly clock: Clock;
  /** The hooks that handle the event, in the order they run. */
  readonly chain: readonly ChainEntry[];
  /** The time all the hooks of the event share, when it has one. */
  readonly group?: { readonly budget: Budget; readonly event: string };
  /** The event as fired, frozen. */
  readonly input: unknown;
  /** What the events part of mods says about this event: result shapes, changes to refuse, what Claude Code receives. */
  readonly rules: EventRules;
  /** How long the matcher engine has for one test. */
  readonly matcherMs: number;
  readonly admit?: (access: HookAccess) => boolean;
}

/** The events whose hooks have less than the usual 10 seconds (reference.md, "Limits"). */
const HOOK_MS: Readonly<Record<string, number>> = { 'prompt.edit': MOD_LIMITS.promptEditMs };

/** The events whose hooks share a limit: all `session.end` hooks together. */
export const GROUP_MS: Readonly<Record<string, number>> = {
  'session.end': MOD_LIMITS.sessionEndMs,
};

export const hookMs = (event: string): number => HOOK_MS[event] ?? MOD_LIMITS.hookMs;

/** The events whose hook results may nest deeper than the limit: the interface trees are measured by their own limit. */
export const NESTING_EXEMPT: ReadonlySet<string> = new Set(['ui.render', 'ui.resolve']);
