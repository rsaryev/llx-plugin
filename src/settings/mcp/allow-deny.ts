import { expandMcpServer } from '../../format/mcp-env.ts';
import { isRemoteMcpServer, type PluginMcpServer } from '../../format/mcp-config.ts';
import type { PolicyEnv } from '../context.ts';
import type { PolicyView } from '../view.ts';
import { commandMatches } from './command-match.ts';
import type { McpEntry, McpEntryKind } from './entries.ts';
import { entryExpansions, lookupIn, type EntryExpansion } from './entry-env.ts';
import { readMcpLists, type McpEntriesByKind } from './lists.ts';
import { ORIGIN_RULES, type McpServerOrigin } from './origins.ts';
import { referenceInUrlScope, urlPatternMatches } from './url-pattern.ts';

export interface McpPolicyEnv {
  /** The environment Claude Code started with: the base of what a policy entry expands in. */
  readonly startup: PolicyEnv;
  /** The live process environment: what the server's own `${VAR}` expands in. */
  readonly live: PolicyEnv;
}

export interface McpPolicySubject {
  /** The label the server goes by: the key in its file, or a claude.ai connector's display name. */
  readonly name: string;
  readonly server: PluginMcpServer;
  /** Defaults to `configured`: a server a user, a plugin or claude.ai adds. */
  readonly origin?: McpServerOrigin;
}

/** The lists that blocked a server. */
export type McpBlockedBy = 'denylist' | 'allowlist';

export type McpServerVerdict =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly blockedBy: McpBlockedBy;
      /** The status of the server in `claude mcp list` and `claude mcp get`. */
      readonly status: string;
      /** What `claude mcp add` says, and what a reconnect says (managed-mcp.md, "How restrictions appear to users"). */
      readonly addError: string;
      readonly reconnectError: string;
    };

const STATUS = 'Blocked by enterprise managed policy';

const ADD_REASON: { readonly [B in McpBlockedBy]: string } = {
  denylist: 'server is explicitly blocked by enterprise policy',
  allowlist: 'not allowed by enterprise policy',
};

const blocked = (blockedBy: McpBlockedBy, name: string): McpServerVerdict => ({
  allowed: false,
  blockedBy,
  status: STATUS,
  addError: `Cannot add MCP server "${name}": ${ADD_REASON[blockedBy]}`,
  reconnectError: `MCP server ${name} is blocked by enterprise managed policy`,
});

/** What an entry is matched against: the label, and the endpoint after the server's own expansion. */
interface Target {
  readonly name: string;
  readonly endpoint?: { readonly url: string } | { readonly command: readonly string[] };
}

type ValueOf<K extends McpEntryKind> = Extract<McpEntry, { readonly kind: K }>['value'];

const MATCHERS: {
  readonly [K in McpEntryKind]: (value: ValueOf<K>, target: Target, list: ListRules) => boolean;
} = {
  // "Exact match only; wildcards are not expanded", and names "never expand".
  serverName: (value, target) => value === target.name,
  serverCommand: (value, target, list) =>
    target.endpoint !== undefined &&
    'command' in target.endpoint &&
    commandMatches(value, target.endpoint.command, list.expansion.expand),
  serverUrl: (value, target, list) =>
    target.endpoint !== undefined &&
    'url' in target.endpoint &&
    !(list.ignoresScopeReferences && referenceInUrlScope(value)) &&
    urlPatternMatches(list.expansion.expand(value), target.endpoint.url),
};

interface ListRules {
  readonly expansion: EntryExpansion;
  /** An entry with a `${VAR}` in its URL's scheme, host or path never matches (allowlist only). */
  readonly ignoresScopeReferences: boolean;
}

function matches<K extends McpEntryKind>(
  entry: { readonly kind: K; readonly value: ValueOf<K> },
  target: Target,
  list: ListRules,
): boolean {
  return MATCHERS[entry.kind](entry.value, target, list);
}

/** The entry kind that admits a server with this endpoint. */
const KIND_OF_ENDPOINT: { readonly [E in 'url' | 'command']: McpEntryKind } = {
  url: 'serverUrl',
  command: 'serverCommand',
};

function entriesFor(allowed: McpEntriesByKind, target: Target): readonly McpEntry[] {
  const endpoint = target.endpoint;
  if (endpoint === undefined) return allowed.serverName;
  const own = allowed[KIND_OF_ENDPOINT['url' in endpoint ? 'url' : 'command']];
  return own.length > 0 ? own : allowed.serverName;
}

/** The target of a server: its command or URL with its own `${VAR}` expanded in the live environment. */
function targetOf(subject: McpPolicySubject, live: PolicyEnv): Target {
  const expanded = expandMcpServer(subject.name, subject.server, lookupIn(live)).server;
  if (expanded === undefined) return { name: subject.name };
  return {
    name: subject.name,
    endpoint: isRemoteMcpServer(expanded)
      ? { url: expanded.url }
      : { command: [expanded.command, ...(expanded.args ?? [])] },
  };
}

export interface McpServerPolicy {
  /** Whether the server may load, and why not. */
  check(subject: McpPolicySubject): McpServerVerdict;
}

/**
 * The allowlist and the denylist over one server (managed-mcp.md, "How a server is evaluated"), in
 * the order the page gives: merge the lists (`lists.ts`), "check the denylist" ("Nothing overrides a
 * denylist match"), "check the allowlist" ("If `allowedMcpServers` isn't set anywhere, every server
 * that passed the denylist loads"). A remote server is allowed by a `serverUrl` entry, a stdio server
 * by a `serverCommand` entry, and a `serverName` match counts only when the list holds no entry of the
 * server's kind. The origins that skip a check are `origins.ts`.
 *
 * The lists are read once, when the policy is created, so one policy gives the same verdict for a
 * server until it is dropped: a host that sees settings change before a user reconnects a server (the
 * docs run the checks again then) builds a new policy, as `McpSettingsPolicy.serverPolicy()` does.
 */
export function createMcpServerPolicy(view: PolicyView, env: McpPolicyEnv): McpServerPolicy {
  const lists = readMcpLists(view);
  const expansions = entryExpansions(view, env.startup);
  const rules: { readonly [L in 'allowed' | 'denied']: ListRules } = {
    allowed: { expansion: expansions.allowed, ignoresScopeReferences: true },
    denied: { expansion: expansions.denied, ignoresScopeReferences: false },
  };
  return {
    check(subject) {
      const origin = ORIGIN_RULES[subject.origin ?? 'configured'];
      if (!origin.denylist) return { allowed: true };
      const target = targetOf(subject, env.live);
      if (lists.denied.some((entry) => matches(entry, target, rules.denied))) {
        return blocked('denylist', subject.name);
      }
      if (lists.allowed === undefined || origin.skipsAllowlist(subject.server)) {
        return { allowed: true };
      }
      const admitted = entriesFor(lists.allowed, target).some((entry) =>
        matches(entry, target, rules.allowed),
      );
      return admitted ? { allowed: true } : blocked('allowlist', subject.name);
    },
  };
}
