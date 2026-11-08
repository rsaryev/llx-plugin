/** Helpers for the tests of the remote handlers (hooks/handlers/remote). */
import type { HandlerEntry, RunContext } from '../../src/hooks/handlers/index.ts';
import type { Environment, HttpClient, McpCaller, ModelRunner } from '../../src/ports/index.ts';
import type { HookHandlerOf } from '../../src/protocol/hook-config.ts';
import type { HookEvent } from '../../src/protocol/official.ts';
import { entry } from './hooks-select.ts';
import { runContext } from './hooks-run.ts';
import { scriptedRunner } from './ports.ts';

/** An `http` handler as a settings file declares it, on `event`. */
export const httpEntry = (
  hook: Omit<HookHandlerOf<'http'>, 'type'>,
  event: HookEvent = 'PostToolUse',
): HandlerEntry<'http'> => ({ ...entry(event), handler: { type: 'http', ...hook } });

export const mcpEntry = (
  hook: Omit<HookHandlerOf<'mcp_tool'>, 'type'>,
  event: HookEvent = 'PostToolUse',
): HandlerEntry<'mcp_tool'> => ({ ...entry(event), handler: { type: 'mcp_tool', ...hook } });

export const promptEntry = (
  hook: Omit<HookHandlerOf<'prompt'>, 'type'>,
  event: HookEvent = 'Stop',
): HandlerEntry<'prompt'> => ({ ...entry(event), handler: { type: 'prompt', ...hook } });

export const agentEntry = (
  hook: Omit<HookHandlerOf<'agent'>, 'type'>,
  event: HookEvent = 'Stop',
): HandlerEntry<'agent'> => ({ ...entry(event), handler: { type: 'agent', ...hook } });

export interface RemoteOptions {
  readonly http?: HttpClient;
  readonly mcp?: McpCaller;
  readonly models?: ModelRunner;
  readonly environment?: Environment;
  readonly input?: string;
  readonly timeouts?: RunContext['timeouts'];
  readonly signal?: AbortSignal;
}

/** A run context whose ports are the remote ones; the command runner is never called. */
export function remoteContext(options: RemoteOptions): RunContext {
  const base = runContext({
    runner: scriptedRunner({}),
    ...(options.environment === undefined ? {} : { environment: options.environment }),
    ...(options.input === undefined ? {} : { input: options.input }),
    ...(options.timeouts === undefined ? {} : { timeouts: options.timeouts }),
  });
  return {
    ...base,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ports: {
      ...base.ports,
      ...(options.http === undefined ? {} : { http: options.http }),
      ...(options.mcp === undefined ? {} : { mcp: options.mcp }),
      ...(options.models === undefined ? {} : { models: options.models }),
    },
  };
}
