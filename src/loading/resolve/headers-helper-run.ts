import { readHelperHeaders } from '../../format/helper-headers.ts';
import { error, type PluginIssue } from '../../format/issues.ts';
import type { CommandResult, CommandRunner } from '../../ports/command-runner.ts';
import { HEADERS_HELPER_TIMEOUT_MS, type HelperRun } from './headers-helper.ts';

/**
 * Running a server's `headersHelper` and using what it prints (mcp.md, "Use dynamic headers for
 * custom authentication"). The kit starts nothing itself: the command goes through `CommandRunner`,
 * and the connection is the host's, handed in as a function.
 */

const problem = (server: string, message: string): PluginIssue =>
  error(`mcpServers.${server}.headersHelper`, message);

/** Why the run produced no usable output, or `undefined` when it ran and exited 0. */
function failure(result: CommandResult): string | undefined {
  if (result.startError !== undefined) {
    return `The headersHelper command could not be run: ${result.startError}`;
  }
  if (result.timedOut) {
    return `The headersHelper command ran longer than ${HEADERS_HELPER_TIMEOUT_MS / 1000} seconds`;
  }
  return result.exitCode === 0 ? undefined : 'The headersHelper command did not exit 0';
}

const OUTPUT_PROBLEMS = {
  'not-an-object': 'The headersHelper command did not print a JSON object',
  'non-string-value': 'The headersHelper command printed a header whose value is not a string',
} as const;

/**
 * Runs the planned command in a shell (`bash`; a host on Windows maps it to the shell it has, as for
 * a hook) from the planned directory and environment, under 10 seconds, and reads the JSON object
 * of string pairs it prints. Every call runs the command: nothing is cached. A command that fails
 * is a `PluginIssue`, never a throw; judgment (spec/judgments.md): the issue's server is the
 * `CLAUDE_CODE_MCP_SERVER_NAME` the helper got.
 */
export async function runMcpHeadersHelper(
  plan: HelperRun,
  runner: CommandRunner,
  signal: AbortSignal,
): Promise<{ readonly headers: Record<string, string> } | PluginIssue> {
  const server = plan.environment.CLAUDE_CODE_MCP_SERVER_NAME ?? '';
  const result = await runner.run({
    spec: { form: 'shell', command: plan.command, shell: 'bash' },
    cwd: plan.cwd,
    env: plan.environment,
    timeoutMs: plan.timeoutMs,
    signal,
  });
  const failed = failure(result);
  if (failed !== undefined) return problem(server, failed);
  const read = readHelperHeaders(result.stdout);
  return 'problem' in read ? problem(server, OUTPUT_PROBLEMS[read.problem]) : read;
}

export interface ConnectionHeaders {
  readonly headers: Record<string, string>;
  /**
   * Whether OAuth is still the fallback: "If you configure an `Authorization` header, Claude Code
   * uses it as the server's credential and doesn't fall back to OAuth", in `headers` or from the helper.
   */
  readonly oauthFallback: boolean;
}

const hasAuthorization = (headers: Readonly<Record<string, string>>): boolean =>
  Object.keys(headers).some((name) => name.toLowerCase() === 'authorization');

/**
 * "Dynamic headers override any static `headers` with the same name": names compare without regard
 * to case (judgment, spec/judgments.md).
 */
export function connectionHeaders(
  staticHeaders: Readonly<Record<string, string>>,
  dynamicHeaders: Readonly<Record<string, string>>,
): ConnectionHeaders {
  const overridden = new Set(Object.keys(dynamicHeaders).map((name) => name.toLowerCase()));
  const headers = {
    ...Object.fromEntries(
      Object.entries(staticHeaders).filter(([name]) => !overridden.has(name.toLowerCase())),
    ),
    ...dynamicHeaders,
  };
  return { headers, oauthFallback: !hasAuthorization(headers) };
}

/** "A `401 Unauthorized` or `403 Forbidden`". */
const REJECTED: ReadonlySet<number> = new Set([401, 403]);

/**
 * How an attempt ended. `needs-authentication`: the retry after a rejected call was rejected too.
 * `failed`: the helper failed, or the server rejected the helper's credential while connecting; the
 * issue then carries the errors.md message when the helper supplied `Authorization`.
 */
export interface HelperAttempt<T> {
  readonly outcome: 'ok' | 'needs-authentication' | 'failed';
  readonly response?: T;
  /** How many times the helper was run again after a rejection: at most one. */
  readonly reruns: number;
  readonly issue?: PluginIssue;
}

/**
 * errors.md, "Server rejected the Authorization header minted by the configured headersHelper": the
 * line Claude Code reports for a connection a server answered with 401 or 403 while the helper
 * supplied `Authorization`.
 */
const rejectedAuthorization = (server: string, status: number): PluginIssue =>
  problem(
    server,
    `Server rejected the Authorization header minted by the configured headersHelper (HTTP ${status}). Check that the helper command returns a valid credential for this MCP endpoint — OAuth fallback is disabled when the helper supplies Authorization.`,
  );

/** What one run of the helper gives: the headers to send, or why there are none. */
export type HelperOutput = { readonly headers: Record<string, string> } | PluginIssue;

const isIssue = (output: HelperOutput): output is PluginIssue => 'severity' in output;

function rejectedWhileConnecting<T extends { readonly status: number }>(
  helperHeaders: Readonly<Record<string, string>>,
  response: T,
  server: string,
): HelperAttempt<T> {
  return hasAuthorization(helperHeaders)
    ? {
        outcome: 'failed',
        response,
        reruns: 0,
        issue: rejectedAuthorization(server, response.status),
      }
    : { outcome: 'failed', response, reruns: 0 };
}

/**
 * One call or one connection with a helper (mcp.md): `produce` runs the helper fresh and gives the
 * headers it printed (`runMcpHeadersHelper`'s output, or none where the plan skipped it), and `send`
 * makes the request with them, merging the server's static headers (`connectionHeaders`). `server` is
 * the name Claude Code shows, for the issue.
 *
 * - `call`: on a 401 or 403 the helper runs again once, the request is retried once with the fresh
 *   headers, and "Claude Code marks the server as needing authentication in `/mcp` only if that retry
 *   also fails".
 * - `connect`: "If the server rejects the helper's credential while connecting, Claude Code reports
 *   the connection as failed rather than marking the server as needing authentication"; no re-run
 *   (a reconnect from `/mcp` runs the helper again).
 */
export async function attemptWithHeadersHelper<T extends { readonly status: number }>(
  phase: 'connect' | 'call',
  produce: () => Promise<HelperOutput>,
  send: (headers: Record<string, string>) => Promise<T>,
  server: string,
): Promise<HelperAttempt<T>> {
  const first = await produce();
  if (isIssue(first)) return { outcome: 'failed', reruns: 0, issue: first };
  const response = await send(first.headers);
  if (!REJECTED.has(response.status)) return { outcome: 'ok', response, reruns: 0 };
  if (phase === 'connect') return rejectedWhileConnecting(first.headers, response, server);
  const again = await produce();
  if (isIssue(again)) return { outcome: 'failed', reruns: 1, issue: again };
  const retried = await send(again.headers);
  const outcome = REJECTED.has(retried.status) ? 'needs-authentication' : 'ok';
  return { outcome, response: retried, reruns: 1 };
}
