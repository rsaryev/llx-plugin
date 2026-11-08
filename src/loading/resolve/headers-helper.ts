import { isCredentialVariable } from '../../format/credential-env.ts';
import {
  DIRECTORIES,
  ORIGIN_RULES,
  type DirectoryKind,
  type HeadersHelperOrigin,
  type HelperContext,
} from './headers-helper-origins.ts';
import { passGate, type HelperNotice, type HelperTrust } from './headers-helper-trust.ts';

/** The server a helper belongs to: the name Claude Code shows, its URL as expanded, and the command. */
export interface HelperServer {
  readonly name: string;
  readonly url: string;
  readonly headersHelper?: string | undefined;
}

/** mcp.md: "gives up on it after 10 seconds". */
export const HEADERS_HELPER_TIMEOUT_MS = 10_000;

/** The three variables of "Claude Code sets these environment variables when executing the helper". */
export function helperVariables(server: {
  readonly name: string;
  readonly url: string;
  readonly pluginRoot?: string;
}): Record<string, string> {
  return {
    CLAUDE_CODE_MCP_SERVER_NAME: server.name,
    CLAUDE_CODE_MCP_SERVER_URL: server.url,
    ...(server.pluginRoot === undefined ? {} : { CLAUDE_PLUGIN_ROOT: server.pluginRoot }),
  };
}

const OWN_VARIABLES: ReadonlySet<string> = new Set([
  'CLAUDE_CODE_MCP_SERVER_NAME',
  'CLAUDE_CODE_MCP_SERVER_URL',
  'CLAUDE_PLUGIN_ROOT',
]);

const REDACTED = 'REDACTED';

/**
 * "The `CLAUDE_CODE_MCP_SERVER_URL` value the helper receives has that part replaced with `REDACTED`":
 * each removed variable's live value, longest first, in the URL as written and URL-encoded
 * (judgment: an embedded value with a space or a slash is written encoded). An empty value matches
 * nothing.
 */
function redacted(url: string, removed: readonly string[]): string {
  const values = removed
    .filter((value) => value !== '')
    .flatMap((value) => [value, encodeURIComponent(value)])
    .toSorted((a, b) => b.length - a.length);
  return values.reduce((text, value) => text.split(value).join(REDACTED), url);
}

/** What the helper starts with: the inherited environment, less credentials where they are removed, plus the three. */
function helperEnvironment(
  server: HelperServer,
  origin: HeadersHelperOrigin,
  context: HelperContext,
): Record<string, string> {
  const rule = ORIGIN_RULES[origin];
  const inherited = Object.entries(context.environment).filter(
    ([name]) => !OWN_VARIABLES.has(name),
  );
  const removed = rule.removesCredentials
    ? inherited.filter(([name]) => isCredentialVariable(name))
    : [];
  const kept = rule.removesCredentials
    ? inherited.filter(([name]) => !isCredentialVariable(name))
    : inherited;
  return {
    ...Object.fromEntries(kept),
    ...helperVariables({
      name: server.name,
      url: redacted(
        server.url,
        removed.map(([, value]) => value),
      ),
      ...(origin === 'plugin' && context.pluginRoot !== undefined
        ? { pluginRoot: context.pluginRoot }
        : {}),
    }),
  };
}

export interface HelperRun {
  readonly run: true;
  readonly loaded: true;
  readonly headersOnly: false;
  readonly command: string;
  readonly workingDirectory: DirectoryKind;
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string>>;
  /** Credential variables were taken out of `environment`. */
  readonly removesCredentials: boolean;
  readonly timeoutMs: number;
}

/** The server connects with its static `headers` alone; `notice` is the refusal a trust gate prints. */
export interface HelperSkipped {
  readonly run: false;
  readonly loaded: true;
  readonly headersOnly: true;
  readonly notice?: HelperNotice;
}

/** An agent file's server in a folder that is not trusted: not loaded, so nothing connects. */
export interface HelperNotLoaded {
  readonly run: false;
  readonly loaded: false;
}

export type HeadersHelperPlan = HelperRun | HelperSkipped | HelperNotLoaded;

const NO_HELPER: HelperSkipped = { run: false, loaded: true, headersOnly: true };

/**
 * What to do with a server's `headersHelper` each time the server connects (mcp.md, "Use dynamic
 * headers for custom authentication"): where to run it, with what environment, or that it does not
 * run. Pure; the host runs it through `runHeadersHelper` and the plan is made again on every
 * connection ("the helper fresh on each connection ... doesn't cache the result").
 */
export function planHeadersHelper(
  server: HelperServer,
  origin: HeadersHelperOrigin,
  trust: HelperTrust,
  context: HelperContext,
): HeadersHelperPlan {
  const rule = ORIGIN_RULES[origin];
  const gate = passGate(rule.gate, server.name, trust, context);
  if (!gate.open)
    return gate.loaded ? { ...NO_HELPER, notice: gate.notice } : { run: false, loaded: false };
  const cwd = DIRECTORIES[rule.directory](context);
  if (server.headersHelper === undefined || cwd === undefined) return NO_HELPER;
  return {
    run: true,
    loaded: true,
    headersOnly: false,
    command: server.headersHelper,
    workingDirectory: rule.directory,
    cwd,
    environment: helperEnvironment(server, origin, context),
    removesCredentials: rule.removesCredentials,
    timeoutMs: HEADERS_HELPER_TIMEOUT_MS,
  };
}
