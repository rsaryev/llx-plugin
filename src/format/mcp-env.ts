import type { McpStdioServerConfig } from '../protocol/official.ts';
import { credentialDebugLine, readsAsEmptyTowardRemote } from './credential-env.ts';
import { error, warning, type PluginIssue } from './issues.ts';
import { isRemoteMcpServer, type PluginMcpServer, type RemoteMcpServer } from './mcp-config.ts';

/**
 * `${VAR}` and `${VAR:-default}` in an MCP server's `command`, `args`, `env`, `url` and `headers`
 * (mcp.md, "Environment variable expansion in `.mcp.json`"). Pure over a lookup function, so it
 * serves a server of the local, project and user scopes (no plugin, no `SubstitutionScope`) and,
 * through `resolveEnvReference` and `splitDefault`, the plugin servers of `loading/resolve`: one rule
 * for both, so they cannot drift.
 *
 * Grammar (judgment, shared with `loading/resolve/substitute`): a reference is `${` text `}` with no
 * braces inside; the default ends at the first `}` and nests nothing; the name is a shell variable
 * name, and anything else is left as written.
 */

/** The environment as a function: a name to its value, `undefined` when it is unset. */
export type EnvLookup = (name: string) => string | undefined;

/** Every `${...}` in a text; the group is what is between the braces. */
export const BRACED_REFERENCE = /\$\{([^{}]*)\}/g;

const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const isVariableName = (text: string): boolean => VARIABLE_NAME.test(text);

/** `NAME` or `NAME:-default`. */
export function splitDefault(inner: string): { name: string; fallback: string | undefined } {
  const at = inner.indexOf(':-');
  return at < 0
    ? { name: inner, fallback: undefined }
    : { name: inner.slice(0, at), fallback: inner.slice(at + 2) };
}

/** The warning text for a reference that stayed as written (mcp.md, "Unset variables without a default"). */
export const missingVariableMessage = (name: string): string =>
  `Environment variable ${name} is not set and has no default`;

export interface EnvReferenceResolution {
  readonly text: string;
  /** True when the variable is unset with no default: `text` is the `${VAR}` as written. */
  readonly missing: boolean;
  /** True when a covered credential variable the environment has set read as empty. */
  readonly credentialRead: boolean;
}

/**
 * What one reference becomes. An empty string counts as set (mcp.md, "Variables set to an empty
 * string"): the default is for an unset variable only. A name `readsAsEmpty` covers is empty whether
 * or not it is set and its default is ignored, with no warning (mcp.md, "Credential variables that
 * read as empty").
 */
export function resolveEnvReference(
  reference: { readonly name: string; readonly fallback: string | undefined },
  lookup: EnvLookup,
  readsAsEmpty?: (name: string) => boolean,
): EnvReferenceResolution {
  const { name, fallback } = reference;
  const value = lookup(name);
  if (readsAsEmpty?.(name) === true) {
    return { text: '', missing: false, credentialRead: value !== undefined };
  }
  const text = value ?? fallback;
  return text === undefined
    ? { text: `\${${name}}`, missing: true, credentialRead: false }
    : { text, missing: false, credentialRead: false };
}

export interface EnvExpansion {
  readonly text: string;
  /** Variables left as written because they are unset and have no default, once each. */
  readonly missing: readonly string[];
  /** Covered credential variables that are set and were read as empty, once each. */
  readonly credentials: readonly string[];
}

/** Expands every reference of a text in one pass: a value is never scanned again. */
export function expandEnvText(
  text: string,
  lookup: EnvLookup,
  readsAsEmpty?: (name: string) => boolean,
): EnvExpansion {
  const missing = new Set<string>();
  const credentials = new Set<string>();
  const expanded = text.replace(BRACED_REFERENCE, (raw, inner: string) => {
    const reference = splitDefault(inner);
    if (!isVariableName(reference.name)) return raw;
    const done = resolveEnvReference(reference, lookup, readsAsEmpty);
    if (done.missing) missing.add(reference.name);
    if (done.credentialRead) credentials.add(reference.name);
    return done.text;
  });
  return { text: expanded, missing: [...missing], credentials: [...credentials] };
}

export interface McpExpansion {
  /** Undefined when the server cannot start: its `url` is not a URL after expansion. */
  readonly server: PluginMcpServer | undefined;
  /** A warning per field with an unset variable; an error when the server is dropped. */
  readonly issues: readonly PluginIssue[];
  /** The unset variables without a default, once each (the `claude mcp list` warning). */
  readonly missing: readonly string[];
  /** Debug-log lines for covered credentials the user set and a remote `url` or `headers` named. */
  readonly debug: readonly string[];
}

/** Collects what the fields of one server raise, in the order they are expanded. */
function fieldExpander(name: string, lookup: EnvLookup, remote: boolean) {
  const issues: PluginIssue[] = [];
  const missing = new Set<string>();
  const credentials = new Set<string>();
  const readsAsEmpty = remote ? readsAsEmptyTowardRemote : undefined;
  const one = (field: string, value: string): string => {
    const done = expandEnvText(value, lookup, readsAsEmpty);
    for (const each of done.missing) {
      missing.add(each);
      issues.push(warning(`mcpServers.${name}.${field}`, missingVariableMessage(each)));
    }
    for (const each of done.credentials) credentials.add(each);
    return done.text;
  };
  const list = (field: string, values: readonly string[]): string[] =>
    values.map((value) => one(field, value));
  const table = (field: string, entries: Readonly<Record<string, string>>) =>
    Object.fromEntries(
      Object.entries(entries).map(([key, value]) => [key, one(`${field}.${key}`, value)]),
    );
  return {
    one,
    list,
    table,
    issues,
    result: () => ({
      missing: [...missing],
      debug: [...credentials].map(credentialDebugLine),
    }),
  };
}

type Fields = ReturnType<typeof fieldExpander>;

const expandStdio = (server: McpStdioServerConfig, fields: Fields): McpStdioServerConfig => ({
  ...server,
  command: fields.one('command', server.command),
  ...(server.args === undefined ? {} : { args: fields.list('args', server.args) }),
  ...(server.env === undefined ? {} : { env: fields.table('env', server.env) }),
});

const expandRemote = (server: RemoteMcpServer, fields: Fields): RemoteMcpServer => ({
  ...server,
  url: fields.one('url', server.url),
  ...(server.headers === undefined ? {} : { headers: fields.table('headers', server.headers) }),
});

/**
 * A server of the local, project or user scope with its references expanded (mcp.md, "Environment
 * variable expansion in `.mcp.json`"): `command`, `args` and `env` of a stdio server; `url` and
 * `headers` of a remote one (`headersHelper` is a command the process runs, so it is left as
 * written). An unset variable without a default keeps its text and is a warning; a covered
 * credential reads as empty in a remote server only.
 *
 * Judgment (spec/judgments.md): a `url` that does not parse after expansion drops the server, whatever
 * the cause, with the docs' `'url' is not a valid URL`; the docs show it for an empty string.
 */
export function expandMcpServer(
  name: string,
  server: PluginMcpServer,
  lookup: EnvLookup,
): McpExpansion {
  const fields = fieldExpander(name, lookup, isRemoteMcpServer(server));
  const expanded = isRemoteMcpServer(server)
    ? expandRemote(server, fields)
    : expandStdio(server, fields);
  const unusable = isRemoteMcpServer(expanded) && !URL.canParse(expanded.url);
  const dropped = error(
    `mcpServers.${name}.url`,
    `Invalid MCP server config for "${name}": 'url' is not a valid URL`,
  );
  return {
    server: unusable ? undefined : expanded,
    issues: unusable ? [...fields.issues, dropped] : fields.issues,
    ...fields.result(),
  };
}

/** Where a configured server comes from, as far as what the surfaces show is concerned. */
export const MCP_DISPLAY_SCOPES = ['local', 'project', 'user', 'managed'] as const;
export type McpDisplayScope = (typeof MCP_DISPLAY_SCOPES)[number];

const asWritten = (url: string): string => url;

/** managed-mcp.md, "What users can see and change": "`https://mcp.example.com/…`". */
const hostOnly = (url: string): string => {
  if (!URL.canParse(url)) return '…';
  const { protocol, host } = new URL(url);
  return `${protocol}//${host}/…`;
};

const REMOTE_DISPLAY: { readonly [S in McpDisplayScope]: (url: string) => string } = {
  local: asWritten,
  project: asWritten,
  user: asWritten,
  managed: hostOnly,
};

/**
 * What `/mcp`, `claude mcp list` and `claude mcp get` show of a server's URL or command line (mcp.md,
 * "How references appear in `/mcp` and CLI output"): for a server of the local, project or user
 * scope the `${VAR}` reference by name, never its resolved value; for a server the organization
 * provides, the URL's host only. Judgment: the host is the URL's host component (with its port) and
 * a URL that does not parse shows nothing of itself. A managed entry has no `command` (managed-mcp.md,
 * "What an entry can contain"), so a command line is shown as written in every scope.

 * `server` is the entry as written, never the result of `expandMcpServer`: the function shows what it
 * is given, so an expanded server would show the resolved value.
 */
export function displayReference(server: PluginMcpServer, scope: McpDisplayScope): string {
  return isRemoteMcpServer(server)
    ? REMOTE_DISPLAY[scope](server.url)
    : [server.command, ...(server.args ?? [])].join(' ');
}

/** One header a surface shows: its name, and its value when the scope shows it. */
export interface DisplayedHeader {
  readonly name: string;
  readonly value?: string;
}

const headerAsWritten = ([name, value]: readonly [string, string]): DisplayedHeader => ({
  name,
  value,
});
const headerNameOnly = ([name]: readonly [string, string]): DisplayedHeader => ({ name });

const HEADER_DISPLAY: {
  readonly [S in McpDisplayScope]: (entry: readonly [string, string]) => DisplayedHeader;
} = {
  local: headerAsWritten,
  project: headerAsWritten,
  user: headerAsWritten,
  managed: headerNameOnly,
};

/**
 * What `claude mcp get` shows of a remote server's headers. For a server the organization provides:
 * "its header names without their values" (managed-mcp.md, "What users can see and change"). Judgment:
 * the docs give no rule for the other scopes, so a header there is shown as written (a `${VAR}`
 * reference by name, as for the URL; pass the entry as written, as for `displayReference`). A stdio
 * server has no headers.
 */
export function displayHeaders(
  server: PluginMcpServer,
  scope: McpDisplayScope,
): readonly DisplayedHeader[] {
  if (!isRemoteMcpServer(server)) return [];
  return Object.entries(server.headers ?? {}).map(HEADER_DISPLAY[scope]);
}
