import type { UiSurface } from '../../protocol/mods-ui-names.ts';
import type { EventData } from '../api/ports.ts';
import type { OpenOrigin } from './panes/placement.ts';
import type { Viewport } from './sites/viewport.ts';
import type { Renderer } from './toast.ts';

/** What `$.ui.notify` resolves to (api.md, "Show something without starting a turn"). */
export type NotifyResult =
  | { readonly isSent: true; readonly channel: string }
  | {
      readonly isSent: false;
      readonly reason: 'disabled' | 'no-channel' | 'no-surface' | 'refused';
    };

/** What `$.ui.copy` resolves to: judgment, the test kit's stub answers `{ isCopied: true }` (test.md). */
export interface CopyResult {
  readonly isCopied: boolean;
}

/**
 * The interface a host draws and the facts about it only the host knows. The kit owns what the docs
 * say about each call (names, limits, what a tree may hold, which toast shows) and the port does the
 * drawing. Type-only; it lives here because it names the interface types of mods.
 */
export interface ModInterface {
  /** The app that is drawing. */
  surface(): UiSurface;
  /** The window as measured; `undefined` before the terminal or the Desktop app measured it. */
  viewport(): Viewport | undefined;
  renderer(): Renderer;
  /** Who caused the call now running: the user (a command, a press) or the mod by itself (a timer, a `turn.start` hook). */
  origin(): OpenOrigin;
  /** Runs the `ui.render` hooks of the mods' sites again. */
  redraw(): void;
  /** Whether the redraw is of the visible pane, the expanded band or the hint line in the terminal. */
  isTerminalVisible(): boolean;
  /** One line under the prompt, already starting `⚠ <mod>: `. */
  status(line: string): void;
  /** A dim line in the transcript, already starting `● <mod>: `. */
  log(line: string): void;
  notify(request: { readonly text: string; readonly title: string }): Promise<NotifyResult>;
  /** The dialog Claude uses to ask: resolves to the label picked or the text typed, rejects when dismissed. */
  ask(request: { readonly question: string; readonly options: readonly string[] }): Promise<string>;
  copy(text: string): Promise<CopyResult>;
  selection(): Promise<string | undefined>;
  /** Judgment: the docs name the arguments of the calls below and no more, so they pass through. */
  notice(request: EventData): Promise<unknown>;
  blit(request: EventData): Promise<unknown>;
  focus(request: EventData): Promise<unknown>;
  scroll(request: EventData): Promise<unknown>;
}
