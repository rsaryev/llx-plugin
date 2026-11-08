import type { JsonObject } from '../foundation/index.ts';
import type { PluginIssue } from '../format/issues.ts';
import type { PluginFiles } from '../ports/index.ts';
import type { ApiEventName, HookFailure, HookOrigin, ModMatcher } from '../protocol/mods-events.ts';

/**
 * The ports a host implements for mods, beyond the shared ones (`Clock`, `PluginFiles`,
 * `CommandRunner`, `HttpClient`, `ModelRunner`, `McpCaller`, `Locations`). They live here and not
 * in `src/ports` because they name `PluginIssue` (docs/ARCHITECTURE.md, "Ports"). Type-only. The
 * ports for the interface, the session, agents, prompts and configuration are declared by the part
 * of mods that implements them.
 */

/** The surface a mod draws on. */
export type ModSurface = 'terminal' | 'desktop' | 'vscode';

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
      readonly code: string;
      readonly options: JsonObject;
      readonly surface: ModSurface;
    },
    signal: AbortSignal,
  ): Promise<{ readonly module?: GuestModule; readonly issues: readonly PluginIssue[] }>;
}

/** TypeScript, TSX and JSX hooks modules to one JavaScript ES module; the host owns the compiler. */
export interface ModCompiler {
  compile(
    input: { readonly files: PluginFiles; readonly entry: string },
    signal: AbortSignal,
  ): Promise<{ readonly code?: string; readonly issues: readonly PluginIssue[] }>;
}

/** One JSON file per mod; the kit owns `get`, `set`, `delete`, `keys` and the size limit. */
export interface ModStore {
  read(plugin: string): Promise<JsonObject>;
  write(plugin: string, data: JsonObject): Promise<void>;
}

/** The variables a mod reads and sets with `$.env`. */
export interface ModEnv {
  get(name: string): string | undefined;
  set(name: string, value: string): void;
}

/** Where usage records go (reference.md, "Telemetry"). */
export interface TelemetrySink {
  log(record: JsonObject): Promise<void>;
  mark(feature: string): Promise<void>;
}

/** Hot reload of a `--plugin-dir` directory. */
export interface ModWatcher {
  watch(dir: string, onChange: () => void): () => void;
}

/** Aborts the turn in progress. */
export interface ModTurnPort {
  abort(): Promise<void>;
}

/** The verdict of a deny rule on a tool call, from the permission rules; `unknown` when it cannot be told. */
export interface DenyRuleChecker {
  verdict(toolName: string, input: unknown): Promise<'deny' | 'ask' | 'none' | 'unknown'>;
}
