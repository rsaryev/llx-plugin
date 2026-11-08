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
  cancel: () => void;
}

export interface ToastBoard {
  /** Raises a toast. */
  show(plugin: string, request: ToastRequest): void;
  /** The toasts drawn now, oldest first. */
  visible(): readonly Toast[];
}

/**
 * The toasts of a session. "In the classic renderer, a mod's newer toast can take the place of its
 * older one that's showing or waiting to show"; in fullscreen rendering "Claude Code draws at most
 * three toasts at a time, so a toast can run out of time before it's drawn" (troubleshoot.md, "A
 * toast doesn't appear"). Judgment: a toast's time runs from when it is raised; a hold shows none.
 */
export function createToastBoard(options: ToastBoardOptions): ToastBoard {
  let queue: Entry[] = [];
  const shown = (): readonly Entry[] =>
    options.isHeld() ? [] : queue.slice(0, RENDERERS[options.renderer()].visible);
  const label = (entry: Toast): string => `$.ui.toast (${entry.plugin}): ${entry.text}`;
  return {
    show(plugin, request) {
      if (RENDERERS[options.renderer()].isReplacing) {
        const showing = new Set(shown());
        for (const older of queue.filter((entry) => entry.plugin === plugin)) {
          older.cancel();
          options.debug(`${label(older)} gave way, ${showing.has(older) ? 'cut short' : 'unseen'}`);
        }
        queue = queue.filter((entry) => entry.plugin !== plugin);
      }
      const entry: Entry = { plugin, text: request.text, cancel: () => undefined };
      entry.cancel = options.clock.setTimer(() => {
        const wasDrawn = shown().includes(entry);
        queue = queue.filter((other) => other !== entry);
        if (!wasDrawn && !RENDERERS[options.renderer()].isReplacing)
          options.debug(`${label(entry)} left the stack, never drawn`);
      }, request.timeoutMs);
      queue.push(entry);
    },
    visible: () => shown().map(({ plugin, text }) => ({ plugin, text })),
  };
}
