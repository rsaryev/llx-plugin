import type { Clock } from '../../ports/index.ts';
import { MOD_LIMITS } from '../../protocol/mods-limits.ts';
import { isRecord } from './elements/node.ts';

/** `{ timeoutMs }` is a whole number of milliseconds, 1 to 60000 (troubleshoot.md, "A toast doesn't appear"). */
export const TOAST_TIMEOUT_PROBLEM = 'timeoutMs is a whole number of ms, 1 to 60000';
const MAX_TOAST_MS = 60_000;

export interface ToastRequest {
  readonly text: string;
  readonly timeoutMs: number;
}

/**
 * The arguments of `$.ui.toast(text, { timeoutMs })`, or why the call is dropped. A toast is shown
 * for 4 seconds unless `timeoutMs` says otherwise (reference.md, "Limits").
 */
export function parseToast(
  text: unknown,
  options: unknown,
): { readonly toast: ToastRequest } | { readonly problem: string } {
  if (typeof text !== 'string') return { problem: 'text is a string' };
  const given = isRecord(options) ? options.timeoutMs : undefined;
  if (given === undefined) return { toast: { text, timeoutMs: MOD_LIMITS.toastMs } };
  const fits =
    typeof given === 'number' && Number.isInteger(given) && given >= 1 && given <= MAX_TOAST_MS;
  return fits ? { toast: { text, timeoutMs: given } } : { problem: TOAST_TIMEOUT_PROBLEM };
}

/** The renderers: toasts differ in how many show at once and in whether a mod's newer toast replaces its older. */
export const RENDERERS = {
  classic: { visible: 1, isReplacing: true },
  fullscreen: { visible: 3, isReplacing: false },
} as const;
export type Renderer = keyof typeof RENDERERS;

export interface Toast {
  readonly plugin: string;
  readonly text: string;
}

export interface ToastBoardOptions {
  readonly clock: Clock;
  readonly renderer: () => Renderer;
  /** A pane that asked for it holds the toasts while it shows (`holdToasts`). */
  readonly isHeld: () => boolean;
  readonly debug: (line: string) => void;
}

interface Entry extends Toast {
  /** The time the toast has left to show, as of `startedAt` while its timer runs. */
  remaining: number;
  startedAt: number;
  cancel: () => void;
}

export interface ToastBoard {
  /** Raises a toast. */
  show(plugin: string, request: ToastRequest): void;
  /** The toasts drawn now, oldest first. */
  visible(): readonly Toast[];
  /** A hold may have begun or ended (a pane opened, closed or was placed): pauses or resumes every toast's time. */
  syncHold(): void;
}

/**
 * The toasts of a session. "In the classic renderer, a mod's newer toast can take the place of its
 * older one that's showing or waiting to show"; in fullscreen rendering "Claude Code draws at most
 * three toasts at a time, so a toast can run out of time before it's drawn" (troubleshoot.md, "A
 * toast doesn't appear"). A hold shows none, "and a toast raised in that time waits until the hold
 * ends" (interface.md, "Hold toasts behind a dialog"). Judgment: a toast's time runs from when it
 * is raised, except that it stands still while a hold lasts, so a hold longer than a toast's
 * timeout does not use the toast up.
 */
export function createToastBoard(options: ToastBoardOptions): ToastBoard {
  let queue: Entry[] = [];
  let isPaused = false;
  const shown = (): readonly Entry[] =>
    options.isHeld() ? [] : queue.slice(0, RENDERERS[options.renderer()].visible);
  const label = (entry: Toast): string => `$.ui.toast (${entry.plugin}): ${entry.text}`;
  const expire = (entry: Entry): void => {
    const wasDrawn = shown().includes(entry);
    queue = queue.filter((other) => other !== entry);
    if (!wasDrawn && !RENDERERS[options.renderer()].isReplacing)
      options.debug(`${label(entry)} left the stack, never drawn`);
  };
  const run = (entry: Entry): void => {
    entry.startedAt = options.clock.now();
    entry.cancel = options.clock.setTimer(() => expire(entry), entry.remaining);
  };
  const pause = (entry: Entry): void => {
    entry.cancel();
    entry.cancel = () => undefined;
    entry.remaining -= options.clock.now() - entry.startedAt;
  };
  const syncHold = (): void => {
    const isHeld = options.isHeld();
    if (isHeld === isPaused) return;
    isPaused = isHeld;
    for (const entry of queue) (isHeld ? pause : run)(entry);
  };
  return {
    show(plugin, request) {
      syncHold();
      if (RENDERERS[options.renderer()].isReplacing) {
        const showing = new Set(shown());
        for (const older of queue.filter((entry) => entry.plugin === plugin)) {
          older.cancel();
          options.debug(`${label(older)} gave way, ${showing.has(older) ? 'cut short' : 'unseen'}`);
        }
        queue = queue.filter((entry) => entry.plugin !== plugin);
      }
      const entry: Entry = {
        plugin,
        text: request.text,
        remaining: request.timeoutMs,
        startedAt: options.clock.now(),
        cancel: () => undefined,
      };
      if (!isPaused) run(entry);
      queue.push(entry);
    },
    visible() {
      syncHold();
      return shown().map(({ plugin, text }) => ({ plugin, text }));
    },
    syncHold,
  };
}
