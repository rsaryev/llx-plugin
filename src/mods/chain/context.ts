import type { Budget } from '../../foundation/index.ts';
import { MOD_LIMITS } from '../../protocol/mods-limits.ts';
import type { Clock } from '../../ports/index.ts';
import type { DispatchOptions, EventRule, HookAccess } from '../types.ts';
import type { AsyncSlot } from '../async-slot.ts';
import type { Frames, HookFrame } from './frames.ts';
import type { CallingHook } from './reentry.ts';
import type { ChainEntry } from './registry.ts';
import type { Steps } from './trace.ts';

/** What one dispatch of an event shares across the hooks it runs. */
export interface Context {
  readonly name: string;
  readonly options: DispatchOptions;
  readonly clock: Clock;
  /** The hooks that handle the event, in the order they run. */
  readonly chain: readonly ChainEntry[];
  /** The time all the hooks of the event share, when it has one. */
  readonly group?: { readonly budget: Budget; readonly event: string };
  /** The event as fired, a frozen copy: what hooks and the rules see. */
  readonly input: unknown;
  /** The host's own event object, for the host's `admit` (an identity fact is checked on it). */
  readonly fired: unknown;
  /** What the kit says about this event: result shapes, changes to refuse, what Claude Code receives. */
  readonly rule: EventRule;
  /** How long the matcher engine has for one test. */
  readonly matcherMs: number;
  readonly admit?: (access: HookAccess) => boolean;
  /** The hooks of each mod running now, shared by every dispatch of the chain: what a mod's call skips. */
  readonly frames: Frames;
  /** The hook running now, followed across `await` when the host gave an `AsyncContext`. */
  readonly running?: AsyncSlot<HookFrame> | undefined;
  /** Who made the call this event came from, read when the dispatch started. */
  readonly calling: CallingHook;
  /** The steps the dispatch took, when `DispatchOptions.trace` asked for them. */
  readonly steps?: Steps;
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
