import type { JsonObject, JsonValue } from '../../foundation/index.ts';

/** The fields of an event or a call's argument: plain data a hook may have changed. */
export type EventData = Readonly<Record<string, unknown>>;
import type { HttpFailure } from '../../ports/index.ts';
import type { EffortLevel } from '../../protocol/official.ts';

/**
 * The ports the mods API reaches (plugins/mods/api.md, "Reach files, processes, and the network").
 * Each is one effect a host implements; the kit owns what the docs say about the call (paths, size
 * limits, redirects, truncation) and the port does the effect. Type-only; they live beside the API
 * because they name mods types.
 */

export type { FsAncestor, FsAncestorsRequest, FsEntry, FsStat, ModFs } from './fs-ports.ts';

/** A piece of what a long-running command wrote. */
export interface SpawnChunk {
  readonly stream: 'stdout' | 'stderr';
  readonly text: string;
}

/** `spawn` of `$.process`: a long-running command whose output streams. Judgment: the docs name no chunk shape. */
export interface ModSpawner {
  /**
   * Starts `argv` in `cwd` with `env` as the whole environment, `input` written to its standard
   * input and then closed (closed from the start when absent); returns how it ended, its exit code
   * and the `signal` that ended it from outside (claude-code/index.d.ts:8663), null or absent when none.
   */
  spawn(run: {
    readonly argv: readonly string[];
    readonly cwd: string;
    readonly env: Readonly<Record<string, string>>;
    readonly input?: string;
    readonly signal: AbortSignal;
  }): AsyncGenerator<
    SpawnChunk,
    { readonly exitCode: number | null; readonly signal?: string | null }
  >;
}

/**
 * One HTTP request of `$.http.fetch`. Unlike the shared `HttpClient` it takes any method (`HEAD`
 * included) and never follows a redirect: the kit judges each hop, so the port returns the 3xx as it is.
 */
export interface FetchRequest {
  readonly method: string;
  readonly url: string;
  /** Header names are lower case. */
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  /**
   * The handle `$.session.authorize()` answered (claude-code/index.d.ts:5548): the port sets the
   * credential header itself. Only on an `https` request; a redirect to another origin drops it.
   */
  readonly auth?: string;
  /** An absolute Unix socket path the request, and every redirect, goes over (index.d.ts:5556). */
  readonly socketPath?: string;
  readonly timeoutMs: number;
  /** Stop reading the body at this many bytes; the kit cuts what a port sends past it. */
  readonly maxBytes: number;
  readonly signal: AbortSignal;
}

export interface FetchResponse {
  readonly status: number;
  /** Header names should be lower case; the kit lower-cases them again. */
  readonly headers: Readonly<Record<string, string>>;
  readonly text: string;
}

export interface ModFetcher {
  request(request: FetchRequest): Promise<FetchResponse | HttpFailure>;
}

/** A block of `prompt` or `system`; `cache` marks a cache breakpoint after it. */
export interface TextBlock {
  readonly text: string;
  readonly cache?: true;
}

/** What `$.model.complete` resolves to: `usage` holds the Claude API's token and cache fields. */
export type CompleteResult =
  | { readonly isAnswered: true; readonly text: string; readonly usage: JsonObject }
  | { readonly isAnswered: false; readonly reason: string };

export interface ModelCall {
  readonly model?: string;
  readonly system?: readonly TextBlock[];
  readonly prompt: readonly TextBlock[];
  readonly maxTokens: number;
  readonly effort?: EffortLevel;
  readonly timeoutMs?: number;
  readonly signal: AbortSignal;
}

/** The session's credentials and models. A request Claude Code will not send rejects. */
export interface ModModels {
  complete(call: ModelCall): Promise<CompleteResult>;
  /** The conversation so far, then `prompt`, on the session's model. */
  fork(call: {
    readonly prompt: readonly TextBlock[];
    readonly signal: AbortSignal;
  }): Promise<CompleteResult>;
  classify(request: EventData, signal: AbortSignal): Promise<unknown>;
}

/** One entry of `$.session.messages()`. */
export interface SessionEntry {
  readonly role: string;
  readonly text: string;
  readonly toolUses: readonly JsonValue[];
}

export interface ModSession {
  /** Every entry of the transcript, oldest first; the kit keeps the newest 4,096. */
  messages(signal: AbortSignal): Promise<readonly SessionEntry[]>;
  cwd(): Promise<string>;
  root(): Promise<string>;
  model(): Promise<string>;
  turns(): Promise<number>;
  id(): Promise<string>;
  repo(): Promise<JsonValue>;
  surfaces(): Promise<readonly string[]>;
  /** `{ startedAt, context: { tokens, window, percent }, rateLimits: [{ kind, percentUsed, resetsAt }], cost }`. */
  usage(): Promise<JsonObject>;
  /** The version, or `{ version, base?, builtAt? }` (claude-code/index.d.ts:3019). */
  version(): Promise<string | JsonObject>;
  /**
   * Compacts the conversation and answers what came of it: `{ messages, tokensBefore?,
   * tokensAfter?, usage? }`, or `{ skip }` (claude-code/index.d.ts:3031).
   */
  compact(signal: AbortSignal): Promise<JsonObject | void>;
  /**
   * Sends the message and resolves with `{ isDelivered }`. `refusal` is the reason the session takes
   * no new work from mods now (`RunGate.refusal`), when it takes none: a host whose target is a
   * subagent that finished or a teammate answers `{ isDelivered: false, reason }` with the sentence
   * from `unsentReason`, and still delivers to a subagent that is running.
   */
  send(to: string, text: string, signal: AbortSignal, refusal?: string): Promise<JsonObject>;
  /**
   * Appends `{ message, agentId? }` and answers the row as stored, `{ message, uuid }`
   * (claude-code/index.d.ts:11730), or `{ deny: reason }` when the host refuses it.
   */
  append(row: EventData, signal: AbortSignal): Promise<EventData | void>;
  authorize(request: EventData, signal: AbortSignal): Promise<unknown>;
}

export interface ModPrompts {
  /**
   * `from` names the mod that sends the text; it is absent for `asUser`, which sends the user's own
   * words. It resolves when the turn starts. `queue` aborts when the user stops the turn first: the
   * kit has then answered the call with a drop, and the host takes the prompt out of its queue.
   */
  submit(
    prompt: {
      readonly text: string;
      readonly asUser?: true;
      readonly from?: string;
    },
    queue?: AbortSignal,
  ): Promise<{ readonly drop?: string }>;
  read(): Promise<{ readonly text: string; readonly cursor: number }>;
  /**
   * Puts `text` in the box by `fill.mode` (`replace`, `append`, `insert`), with the call's
   * `decorations` and `cursor` (claude-code/index.d.ts:9284); answers `PromptFilled` (:9325), the
   * box afterwards and why the engine refused, when it did.
   */
  fill(
    text: string,
    fill?: EventData,
  ): Promise<{
    readonly isFilled: boolean;
    readonly refusal?: 'no_composer' | 'dialog';
    readonly text?: string;
    readonly cursor?: number;
  }>;
  suggest(text: string): Promise<{ readonly isShown: boolean }>;
  compose(): Promise<
    readonly { readonly id: string; readonly text: string; readonly scope: string }[]
  >;
}

export interface ModAgents {
  spawn(definition: EventData, signal: AbortSignal): Promise<unknown>;
  /** This session's subagents and teammates, each with a `status`. */
  list(): Promise<readonly JsonObject[]>;
}

/** Where a slash command comes from (claude-code/index.d.ts:1935, `CommandSource`). */
export type CommandSource = 'builtin' | 'plugin' | 'user' | 'mcp';

/** One slash command as `$.command.list()` returns it (claude-code/index.d.ts:1776, `CommandInfo`). */
export interface CommandListing {
  readonly name: string;
  readonly description: string;
  readonly source: CommandSource;
  /** Which plugin added it, when `source` is `plugin` and the host knows. */
  readonly plugin?: string;
  /** The kit's: the hint a mod registered with its command. */
  readonly argumentHint?: string;
}

export interface ModCommands {
  /** The names of Claude Code's own commands, which a mod's command cannot take. */
  builtIns(): readonly string[];
  /**
   * The host's own commands for `$.command.list()` (built-in, user, MCP and plugin files), before
   * the ones mods registered, which the kit adds; without it the list holds only those.
   */
  list?(): Promise<readonly CommandListing[]>;
  /**
   * Runs a command's body (a built-in, a skill, a command file, an MCP prompt) for `$.command.run`,
   * after the `command.run` hooks ran; rejects with the reason when it is refused. Never handed a
   * command a mod registered (the kit ends those), and must not call `ModsHost.runCommand` or fire
   * `command.run`: that would run the hooks a second time. `queue` aborts when the user stops
   * the turn before the command ran: the kit has then rejected the call, and the host drops the command.
   */
  run(
    command: { readonly command: string; readonly args: string },
    queue?: AbortSignal,
  ): Promise<unknown>;
}

export interface ModTools {
  /**
   * Runs a tool call. `held` answers whether the session's input is held now (a Stop, a limit or the
   * end of input): a foreground Bash or PowerShell command that reaches its timeout while it is held
   * is ended instead of moving to the background, resolves with `isError` set, and its output
   * includes `HELD_AT_TIMEOUT` (api.md, "Work your mod started before the interruption").
   */
  call(call: EventData, signal: AbortSignal, held?: () => Promise<boolean>): Promise<unknown>;
  check(call: EventData, signal: AbortSignal): Promise<unknown>;
}

export interface ModTurns {
  /**
   * Cancels the running main-loop turn `turnId`; rejects, naming both ids, when it is not the
   * running turn's (claude-code/index.d.ts:3088).
   */
  abort(turnId?: string): Promise<void>;
}

export interface ModConfig {
  list(): Promise<readonly JsonObject[]>;
  /**
   * Writes one row; answers `{ value }` once written or `{ deny }` when the value does not fit, a
   * trusted source owns the row or only its dialog changes it (claude-code/index.d.ts:3311). Nothing
   * answered reads as `{ value }` of the value written.
   */
  set(key: string, value: unknown): Promise<JsonObject | void>;
}

/** `{ source, settings }` for one source in use that holds settings. */
export interface SettingsLayer {
  readonly source: string;
  readonly settings: JsonObject;
}

/** Mods' own port for settings (not the settings stream's `SettingsSources`). */
export interface ModSettingsReader {
  /** The layers in use that hold settings, lowest precedence first: `plugin`, `user`, `project`, `local`, `flag`, `policy`. */
  layers(): Promise<readonly SettingsLayer[]>;
  /** The layers merged by precedence into one object. */
  merged(layers: readonly SettingsLayer[]): JsonObject;
}

export type {
  BackdropDrawn,
  ModAccount,
  ModAudio,
  ModNotifications,
  ModPromptBox,
  ModTheme,
  PromptMedia,
  PromptPainted,
  SessionBackdrop,
  SessionIdentity,
} from './optional-port-types.ts';

/** The environment variables a mod reads and sets; `snapshot` is the environment a command gets. */
export interface ModEnv {
  get(name: string): string | undefined;
  /** Sets the variable, or unsets it when `value` is undefined (claude-code/index.d.ts:3845). */
  set(name: string, value: string | undefined): void;
  snapshot(): Readonly<Record<string, string>>;
}

/** Every effect the mods API reaches. The shared ports are the ones every stream uses. */
