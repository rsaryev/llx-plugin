import type { HttpClient } from '../../../ports/index.ts';
import type { HandlerEntry, HandlerResult, RunContext } from '../context.ts';
import { handlerTimeoutMs } from '../timeouts.ts';
import { failureRun, withoutPort } from './failure-run.ts';
import { interpolateHeaders } from './http-env.ts';

/**
 * An `http` hook (hooks.md, "HTTP hook fields"): "Claude Code sends the hook's JSON input as the
 * POST request body with `Content-Type: application/json`". The run is the raw answer; what a
 * status or a body means ("HTTP response handling") is the interpreter's.
 */

const JSON_TYPE = { 'content-type': 'application/json' } as const;

export async function runHttp(
  entry: HandlerEntry<'http'>,
  context: RunContext,
): Promise<HandlerResult> {
  const client: HttpClient | undefined = context.ports.http;
  if (client === undefined) return withoutPort(entry, 'http', 'HttpClient');
  const { url, headers, allowedEnvVars } = entry.handler;
  const timeoutMs = handlerTimeoutMs(entry, context.timeouts);
  const answer = await client.request({
    method: 'POST',
    url,
    // Judgment: the kit's Content-Type wins over one a config sets.
    headers: {
      ...interpolateHeaders(headers, allowedEnvVars, context.ports.environment),
      ...JSON_TYPE,
    },
    body: context.input,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    signal: context.signal,
  });
  if ('failure' in answer) {
    return {
      run: failureRun(answer, (message) => ({ kind: 'http-failed', message })),
      issues: [],
    };
  }
  return { run: { kind: 'http', status: answer.status, body: answer.body }, issues: [] };
}
