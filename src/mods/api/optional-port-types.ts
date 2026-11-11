import type { EventData } from './ports.ts';

/**
 * The ports a host may leave out (`ModOptionalPorts`, host-ports.ts) and what they answer: each
 * has a default that answers as the declarations say a session without the capability does
 * (declarations 2.1.321, AGENTS.md E2a).
 */

export interface ModAudio {
  /**
   * Plays `{ clip, shouldLoop, gain? }` (claude-code/index.d.ts:7327); `signal` stops the clip (a
   * loop plays until it aborts), the caller's own or the call's.
   */
  play(request: EventData, signal?: AbortSignal): Promise<void>;
  speak(text: string): Promise<void>;
}

/**
 * The session's backdrop, as the `Backdrop` render site's props (reference.md, "Render sites"):
 * the fields `$.theme.set` was given and `plugin`, the mod that set it.
 */
export interface SessionBackdrop {
  readonly id: string;
  readonly plugin: string;
  /** Whether the drawing is light or dark. */
  readonly colorScheme?: 'light' | 'dark';
  /** Judgment: the docs point to the generated types for `glass`, so its value is carried as given. */
  readonly glass?: unknown;
}

/** What `$.theme.set` resolves to (interface.md, "Put a backdrop behind the conversation"). */
export type BackdropDrawn =
  | { readonly isDrawn: true }
  | { readonly isDrawn: false; readonly reason: string };

/** The apps connected to the session that draw a backdrop: the Desktop app and the mobile app. */
export interface ModTheme {
  /**
   * `{ isDrawn: true }` when a Desktop or mobile app connected to the session says it draws
   * backdrops; otherwise `isDrawn: false` and the reason, such as no such app being connected.
   */
  drawn(): Promise<BackdropDrawn>;
  /** The session's backdrop is now `backdrop`, or none: the apps draw it at the `Backdrop` site, or take it off. */
  changed(backdrop: SessionBackdrop | undefined): void;
}
/**
 * How the session is signed in (`SessionIdentity`, claude-code/index.d.ts:12152): `kind`
 * (`claude.ai`, `console`, `api-key`, `none`, a cloud provider's name) and whether the server
 * vouched for the account; the organization and email only where managed `forceLoginOrgUUID`
 * lists the organization.
 */
export interface SessionIdentity {
  readonly kind: string;
  readonly organizationId?: string;
  readonly organizationType?: string;
  readonly email?: string;
  readonly isVerified: boolean;
}

/** The session's sign-in, as `$.session.identity()` answers it to a mod managed settings install (:3081). */
export interface ModAccount {
  identity(): Promise<SessionIdentity>;
}

/** What `$.prompt.paint` resolves to (`PromptPainted`, :9786): whether the runs stand, and the box as it is. */
export interface PromptPainted {
  readonly isPainted: boolean;
  readonly text: string;
  readonly cursor: number;
}

/**
 * One slice of an image or document of the prompt in flight (`PromptMedia`, :9466): its bytes as
 * base64, at most 4 MiB a call; `{ unreadable }` when the engine sends a line of text in its place,
 * `{ deny }` when no submission in flight carries the id.
 */
export type PromptMedia =
  | {
      readonly type: 'image' | 'document';
      readonly mediaType: string;
      readonly base64: string;
      readonly size: number;
      readonly next?: number;
    }
  | { readonly unreadable: string }
  | { readonly deny: string };

/** The prompt box beyond its text: decorations a plugin paints, and the media of the prompt in flight. */
export interface ModPromptBox {
  /**
   * Sets `plugin`'s decorations over the draft (`{ decorations, text? }`, :3168), its text, caret
   * and undo untouched; `isPainted: false` when the draft no longer reads `text`.
   */
  paint(request: EventData, plugin: string): Promise<PromptPainted>;
  /** The slice of item `id` from `offset` (:3143), for the plugin whose `prompt.submit` hook runs. */
  media(
    request: { readonly id: string; readonly offset?: number },
    plugin: string,
  ): Promise<PromptMedia>;
}

/** The host that raises notifications: takes one of `plugin`'s back by its `key` (:2536). */
export interface ModNotifications {
  cancel(key: string, plugin: string): Promise<{ readonly isSent: boolean }>;
}
