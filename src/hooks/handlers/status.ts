import type { HookEvent } from '../../protocol/official.ts';
import type { RegisteredHandler } from '../contracts.ts';

/**
 * `statusMessage` (hooks.md, "Common fields"): "Custom spinner message displayed while the hook
 * runs". Showing a spinner is the host's job; the kit tells it when a hook starts and with what
 * text.
 */
export interface HookStarted {
  readonly event: HookEvent;
  readonly handlerId: string;
  /** Absent when the handler has none: the host shows its own label. */
  readonly statusMessage?: string;
}

/** The part of the host's hook observer the run stage drives; the other callbacks are the engine's. */
export interface StartObserver {
  started?(info: HookStarted): void;
}

export function announceStart(observer: StartObserver | undefined, entry: RegisteredHandler): void {
  const { statusMessage } = entry.handler;
  observer?.started?.({
    event: entry.event,
    handlerId: entry.id,
    ...(statusMessage === undefined ? {} : { statusMessage }),
  });
}
