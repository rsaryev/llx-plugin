import type { JsonObject } from '../foundation/index.ts';
import type { PluginIssue } from '../format/issues.ts';
import type { PluginFiles } from '../ports/index.ts';
import type { ApiEventName, HookFailure, HookOrigin, ModMatcher } from '../protocol/mods-events.ts';
import type { CompileResult } from './load/compile-output.ts';
import type { ModNext, ModsApi } from './types.ts';

/**
 * The ports a host implements for mods, beyond the shared ones (`Clock`, `PluginFiles`,
 * `CommandRunner`, `HttpClient`, `ModelRunner`, `McpCaller`, `Locations`). They live here and not
 * in `src/ports` because they name `PluginIssue` (docs/ARCHITECTURE.md, "Ports"). Type-only. The
 * ports for the interface, the session, agents, prompts and configuration are declared by the part
 * of mods that implements them.
 */

/** What a hook receives from the host's runtime to reach the kit: `$` calls, `next`, and its own signal. */
export interface HookCall {
  /** The event, as frozen data. */
  readonly event: unknown;
  /** A mods API call, by the event it fires: the kit's chain sees every `$.x.y`. */
  api(path: ApiEventName, args: readonly unknown[]): Promise<unknown>;
  next(e: unknown): Promise<unknown> | AsyncGenerator<unknown, unknown>;
  nextTo(e: unknown, tier: string): Promise<unknown>;
  readonly signal: AbortSignal;
  readonly origin: HookOrigin;
  budget(): { readonly ms: number; readonly remainingMs: number };
  /**
   * For a runtime that evaluates in this process (the test kit's `inlineRuntime`): the mod's own `$`
   * and the chain's own `next`, so the hook runs exactly as the chain calls it and keeps the
   * synchronous members (`$.ui.resolve`). A runtime in another isolate marshals through `api` and
   * `next` instead and ignores this.
   */
  readonly direct?: {
    readonly $: ModsApi;
    readonly next: ModNext<unknown, Promise<unknown> | AsyncGenerator<unknown, unknown>>;
  };
}

/** One hook a hooks module registered, as the runtime hands it back: a stand-in the kit can call. */
export interface GuestHook {
  /** The event as written: a name, `*` or `classic.*`. */
  readonly event: string;
  readonly matcher?: ModMatcher;
  /** `generator` for an async generator, which is what a hook on a streaming event is. */
  readonly kind: 'function' | 'generator';
  readonly hasCatch: boolean;
  run(call: HookCall): Promise<unknown> | AsyncGenerator<unknown, unknown>;
  runCatch?(
    call: HookCall & { readonly error: HookFailure; readonly called: () => boolean },
  ): Promise<unknown>;
}

export interface GuestModule {
  readonly hooks: readonly GuestHook[];
  dispose(): Promise<void>;
}

/**
 * The host evaluates one compiled hooks module in an isolate it chooses (a worker, an isolate, a
 * child process), calls its `register(on, options)`, and hands back what registered. The kit never
 * runs a module's source.
 */
export interface ModRuntime {
  load(
    input: {
      readonly plugin: string;
      readonly entry: string;
      /** The compiler's run output: the code, in the format the host's compiler chose (`ModCompiler`). */
      readonly code: string;
      readonly format: string;
      readonly options: JsonObject;
      /** Where the mod draws, a word such as `terminal`, `desktop` or `vscode`: the docs give no closed list. */
      readonly surface: string;
    },
    signal: AbortSignal,
  ): Promise<{ readonly module?: GuestModule; readonly issues: readonly PluginIssue[] }>;
}

/**
 * TypeScript, TSX and JSX hooks modules to JavaScript; the host owns the compiler and chooses the
 * format its engine runs. It returns two outputs: `scan`, an ES module the static scan reads, and
 * `run`, the code and format `ModRuntime.load` receives. A compiler whose run output is an ES
 * module (`format: 'esm'`) may return it alone, and the scan reads it.
 */
export interface ModCompiler {
  compile(
    input: { readonly files: PluginFiles; readonly entry: string },
    signal: AbortSignal,
  ): Promise<CompileResult>;
}

/**
 * Runs a regular expression of a matcher outside the host's thread, or under a limit (events.md,
 * "Filter which events a hook handles"): a hook's pattern is written by the mod's author, and a
 * pattern such as `/^(a+)+$/` can run for ever on the thread that serves the session. Without one
 * the kit tests a pattern with the engine's own `RegExp`, in this thread.
 */
export interface MatcherEngine {
  /** Prepares a pattern; throws a `SyntaxError` when `source` is not a valid expression, which refuses the module. */
  compile(source: string, flags: string): MatcherPattern;
}

/** One pattern ready to test strings. */
export interface MatcherPattern {
  /**
   * Whether `value` matches. May answer later; stops when `limit.signal` aborts, which the kit does
   * once `limit.ms` has passed without an answer. A rejection counts as a refusal.
   */
  test(
    value: string,
    limit: { readonly ms: number; readonly signal: AbortSignal },
  ): boolean | Promise<boolean>;
}

/** One JSON file per mod; the kit owns `get`, `set`, `delete`, `keys` and the size limit. */
export interface ModStore {
  read(plugin: string): Promise<JsonObject>;
  write(plugin: string, data: JsonObject): Promise<void>;
}

/** Where usage records go (reference.md, "Telemetry"). */
export interface TelemetrySink {
  log(record: JsonObject): Promise<void>;
  mark(feature: string): Promise<void>;
}

/** The verdict of a deny rule on a tool call, from the permission rules; `unknown` when it cannot be told. */
export interface DenyRuleChecker {
  verdict(toolName: string, input: unknown): Promise<'deny' | 'ask' | 'none' | 'unknown'>;
}
