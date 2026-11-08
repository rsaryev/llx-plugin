/**
 * Fires events through one engine over fakes, with the options the outcome tests need: the real
 * output stage or the stand-in, an environment, an abort signal, an interrupt, and several events
 * in a row against the same engine (the Stop block cap counts across dispatches).
 */
import {
  createHookEngine,
  createHookRegistry,
  createOutputStage,
  type EventFactsOf,
  type HookEngine,
  type HookOutcome,
  type HookSession,
  type OutputStage,
  type RegisteredHandler,
  type StopBlockCap,
  type UserInterrupt,
} from '../../src/hooks/index.ts';
import type { McpCaller } from '../../src/ports/index.ts';
import { ifEvaluatorFor } from '../../src/hooks/select/if-guard.ts';
import type { HookEvent } from '../../src/protocol/official.ts';
import { FACTS, session } from './hooks-select.ts';
import type { HttpReply, RunnerReply } from './ports.ts';
import { fakeEnvironment, locations, recordingHttp, scriptedRunner } from './ports.ts';
import { matchContext } from './rule-context.ts';

export interface SessionOptions {
  readonly environment?: Record<string, string>;
  /** Answers of the HTTP client for `http` hooks. */
  readonly http?: readonly HttpReply[];
  /** The output stage; the real one by default. */
  readonly output?: OutputStage;
  /** The Stop block counter, when the host owns it (`HookEngineOptions.stopCap`). */
  readonly stopCap?: StopBlockCap;
  /** Plugin ids whose directory exists (the engine checks it before a plugin command hook runs). */
  readonly pluginIds?: readonly string[];
  /** The MCP client for `mcp_tool` hooks. */
  readonly mcp?: McpCaller;
}

/** One engine and the runs it made; `fire` dispatches one event through it. */
export function engineSession(
  entries: readonly RegisteredHandler[],
  replies: readonly RunnerReply[],
  options: SessionOptions = {},
) {
  const runner = scriptedRunner(...replies);
  const http = recordingHttp(...(options.http ?? []));
  const engine: HookEngine = createHookEngine(
    {
      commands: runner,
      locations: locations({
        directories: (options.pluginIds ?? []).map((id) => `/plugins/${id}`),
      }),
      environment: fakeEnvironment(options.environment ?? {}),
      http,
      ...(options.mcp === undefined ? {} : { mcp: options.mcp }),
    },
    {
      output: options.output ?? createOutputStage(),
      ifEvaluator: ifEvaluatorFor(matchContext),
      ...(options.stopCap === undefined ? {} : { stopCap: options.stopCap }),
    },
  );
  const registry = createHookRegistry(entries);
  return {
    runner,
    http,
    fire: <E extends HookEvent>(
      event: E,
      extra: {
        readonly facts?: EventFactsOf<E>;
        readonly signal?: AbortSignal;
        readonly interrupt?: UserInterrupt;
        readonly session?: HookSession;
      } = {},
    ): Promise<HookOutcome<E>> =>
      engine.dispatch(registry, {
        event,
        facts: extra.facts ?? FACTS[event],
        session: extra.session ?? session(),
        signal: extra.signal ?? new AbortController().signal,
        ...(extra.interrupt === undefined ? {} : { interrupt: extra.interrupt }),
      }),
  };
}
