import type { JsonObject, JsonValue } from '../../foundation/index.ts';

/** The fields of an event or a call's argument: plain data a hook may have changed. */
export type EventData = Readonly<Record<string, unknown>>;
import type { Clock, CommandRunner, HttpFailure, Locations, McpCaller } from '../../ports/index.ts';
import type { EffortLevel } from '../../protocol/official.ts';
import type { ModStore, TelemetrySink } from '../ports.ts';

/**
 * The ports the mods API reaches (plugins/mods/api.md, "Reach files, processes, and the network").
 * Each is one effect a host implements; the kit owns what the docs say about the call (paths, size
 * limits, redirects, truncation) and the port does the effect. Type-only; they live beside the API
 * because they name mods types.
 */

/** One entry of `$.fs.list`: `{ name, kind, size, isLink }`. */
export interface FsEntry {
  readonly name: string;
  readonly kind: string;
  readonly size: number;
  readonly isLink: boolean;
}

/** What `$.fs.stat` resolves to. Judgment: the docs name no field, so it carries the list entry's. */
export interface FsStat {
  readonly kind: string;
  readonly size: number;
  readonly isLink: boolean;
}

/** The host's file system, with the same permissions as the user running Claude Code. Paths are absolute. */
export interface ModFs {
  /** The file's text and its size in bytes, or `undefined` when there is no such file. */
  read(path: string, signal: AbortSignal): Promise<{ text: string; bytes: number } | undefined>;
  write(path: string, text: string, signal: AbortSignal): Promise<void>;
  list(path: string, signal: AbortSignal): Promise<readonly FsEntry[] | undefined>;
  stat(path: string, signal: AbortSignal): Promise<FsStat | undefined>;
  exists(path: string, signal: AbortSignal): Promise<boolean>;
  /** The directories above `path`, nearest first. Judgment: the docs name the method and say no more. */
  ancestors(path: string, signal: AbortSignal): Promise<readonly string[]>;
}

/** A piece of what a long-running command wrote. */
export interface SpawnChunk {
  readonly stream: 'stdout' | 'stderr';
  readonly text: string;
}

/** `spawn` of `$.process`: a long-running command whose output streams. Judgment: the docs name no chunk shape. */
export interface ModSpawner {
  spawn(run: {
    readonly argv: readonly string[];
    readonly cwd: string;
    readonly env: Readonly<Record<string, string>>;
    readonly signal: AbortSignal;
  }): AsyncGenerator<SpawnChunk, { readonly exitCode: number | null }>;
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
  version(): Promise<string>;
  compact(signal: AbortSignal): Promise<void>;
  send(to: string, text: string, signal: AbortSignal): Promise<JsonObject>;
  append(row: EventData, signal: AbortSignal): Promise<void>;
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
  fill(text: string): Promise<{ readonly isFilled: boolean }>;
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

export interface ModCommands {
  /** The names of Claude Code's own commands, which a mod's command cannot take. */
  builtIns(): readonly string[];
  /**
   * Runs a command; rejects with the reason when it is refused. `queue` aborts when the user stops
   * the turn before the command ran: the kit has then rejected the call, and the host drops the command.
   */
  run(
    command: { readonly command: string; readonly args: string },
    queue?: AbortSignal,
  ): Promise<unknown>;
}

export interface ModTools {
  call(call: EventData, signal: AbortSignal): Promise<unknown>;
  check(call: EventData, signal: AbortSignal): Promise<unknown>;
}

export interface ModTurns {
  abort(): Promise<void>;
}

export interface ModConfig {
  list(): Promise<readonly JsonObject[]>;
  set(key: string, value: unknown): Promise<void>;
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

export interface ModAudio {
  play(request: EventData): Promise<void>;
  speak(text: string): Promise<void>;
}

/** The environment variables a mod reads and sets; `snapshot` is the environment a command gets. */
export interface ModEnv {
  get(name: string): string | undefined;
  set(name: string, value: string): void;
  snapshot(): Readonly<Record<string, string>>;
}

/** Every effect the mods API reaches. The shared ports are the ones every stream uses. */
export interface ModHostPorts {
  readonly clock: Clock;
  readonly locations: Locations;
  readonly fs: ModFs;
  readonly runner: CommandRunner;
  readonly spawner: ModSpawner;
  readonly fetcher: ModFetcher;
  readonly mcp: McpCaller;
  readonly env: ModEnv;
  readonly store: ModStore;
  readonly models: ModModels;
  readonly session: ModSession;
  readonly prompts: ModPrompts;
  readonly agents: ModAgents;
  readonly commands: ModCommands;
  readonly tools: ModTools;
  readonly turns: ModTurns;
  readonly config: ModConfig;
  readonly settings: ModSettingsReader;
  readonly audio: ModAudio;
  readonly telemetry: TelemetrySink;
}
