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

/**
 * What `$.ui.copy` resolves to (claude-code/index.d.ts:15339, `UiCopyResult`): `{ isCopied: true }`,
 * or `{ isCopied: false, reason }`; a host that gives no reason for a refusal gets `no-clipboard`.
 */
export interface CopyResult {
  readonly isCopied: boolean;
  readonly reason?: 'no-clipboard' | 'no-surface' | 'refused';
}

/** What `$.ui.selection` reads (:16163, `UiSelection`): the selected text, and the row it lies in. */
export interface UiSelection {
  readonly text: string;
  readonly requestId?: string;
}

/**
 * The events whose cached answers `$.ui.invalidate` drops (claude-code/index.d.ts:5929,
 * `InvalidatableEventName`), `ui.render` aside: the host runs their hooks again.
 */
export type RerunEvent =
  | 'prompt.section'
  | 'prompt.context'
  | 'prompt.attachment'
  | 'tool.describe'
  | 'command.describe'
  | 'config.describe';

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
  /**
   * The pane the surface shows, the others being tabs behind it (`UiPane.isShown`,
   * claude-code/index.d.ts:15797); without it, the newest pane that is placed.
   */
  shownPane?(): string | undefined;
  /** The pane the person has given the keyboard (`UiPane.isFocused`); without it, none. */
  focusedPane?(): string | undefined;
  /** Whether an attached surface draws the rows of `$.ui.place` (the terminal's `Placed` site). */
  drawsPlacedRows(): boolean;
  /** Runs the `ui.render` hooks of the mods' sites again. */
  redraw(): void;
  /**
   * `$.ui.invalidate(event)` for an event whose answers the engine caches (`prompt.section`,
   * `tool.describe`, ...): the host runs that event's hooks again before the next turn, and
   * `nextTurnText` says what Claude then reads.
   */
  rerun(event: RerunEvent): void;
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
  /** The selection as text, or with the row it lies in; `undefined` when nothing is selected. */
  selection(): Promise<string | UiSelection | undefined>;
  /** `$.ui.notice(tool_use_id, text)`: `{ tool_use_id, text }`, `text` absent to remove the line. */
  notice(request: EventData): Promise<unknown>;
  /** Judgment: the docs name the arguments of the calls below and no more, so they pass through. */
  blit(request: EventData): Promise<unknown>;
  focus(request: EventData): Promise<unknown>;
  scroll(request: EventData): Promise<unknown>;
  /** `$.ui.view({ agentId })`: an agent's transcript in the main view; `{}` goes back to the main one. */
  view(request: EventData): Promise<unknown>;
}
