import { dropped, failedClosed, kept, stripInvalid, type Repair } from '../repair/support.ts';
import { isRecord } from '../../protocol/is-record.ts';

/**
 * The entries of `allowedMcpServers` and `deniedMcpServers` (managed-mcp.md, "Match servers by URL,
 * command, or name"): "an object with a single key that identifies servers by their URL, their command,
 * or their name". The two lists differ in one rule, the `serverName` text: the allowlist limits it to
 * "letters, numbers, hyphens, and underscores", the denylist takes "any non-empty string without
 * leading or trailing whitespace", so a claude.ai connector can be blocked by its display name.
 *
 * Invalid entries follow managed-settings.md, "Keys that fail closed": "an individual invalid entry is
 * stripped and the valid subset is enforced". A value that is no list: unreadable in the policy tier an
 * allowlist is enforced as an empty one ("so no MCP servers that users add are admitted"); a denylist
 * is dropped with a warning ("denying every server would block servers the policy never named"); in
 * any other source the value is dropped.
 */
export const MCP_ENTRY_KINDS = ['serverName', 'serverCommand', 'serverUrl'] as const;
export type McpEntryKind = (typeof MCP_ENTRY_KINDS)[number];

export type McpEntry =
  | { readonly kind: 'serverName'; readonly value: string }
  | { readonly kind: 'serverCommand'; readonly value: readonly string[] }
  | { readonly kind: 'serverUrl'; readonly value: string };

export const MCP_LISTS = ['allowed', 'denied'] as const;
export type McpList = (typeof MCP_LISTS)[number];

const isText = (value: unknown): value is string => typeof value === 'string';

interface NameRule {
  readonly accepts: (name: string) => boolean;
  readonly describes: string;
}

const NAME_RULES: { readonly [L in McpList]: NameRule } = {
  allowed: {
    accepts: (name) => /^[A-Za-z0-9_-]+$/.test(name),
    describes: 'letters, numbers, hyphens and underscores',
  },
  denied: {
    accepts: (name) => name.length > 0 && name.trim() === name,
    describes: 'a non-empty text without leading or trailing whitespace',
  },
};

type EntryReader = (value: unknown, list: McpList) => McpEntry | undefined;

const READERS: { readonly [K in McpEntryKind]: EntryReader } = {
  serverName: (value, list) =>
    isText(value) && NAME_RULES[list].accepts(value) ? { kind: 'serverName', value } : undefined,
  // "@minItems 1" in the SDK's type: a command is the program and its arguments.
  serverCommand: (value) =>
    Array.isArray(value) && value.length > 0 && value.every(isText)
      ? { kind: 'serverCommand', value }
      : undefined,
  serverUrl: (value) => (isText(value) ? { kind: 'serverUrl', value } : undefined),
};

/** The entry `raw` is, or `undefined` when it is not an object with exactly one valid key. */
export function readMcpEntry(raw: unknown, list: McpList): McpEntry | undefined {
  if (!isRecord(raw)) return undefined;
  const keys = Object.keys(raw);
  const kind = MCP_ENTRY_KINDS.find((known) => known === keys[0]);
  return keys.length === 1 && kind !== undefined ? READERS[kind](raw[kind], list) : undefined;
}

/** The valid entries of a list value, in order; what is no list has none. */
export const readMcpEntries = (value: unknown, list: McpList): readonly McpEntry[] =>
  Array.isArray(value) ? value.flatMap((raw) => readMcpEntry(raw, list) ?? []) : [];

const REASONS: { readonly [L in McpList]: string } = {
  allowed: `Expected an object with one of serverName (${NAME_RULES.allowed.describes}), serverCommand (a non-empty list of texts) or serverUrl (a text)`,
  denied: `Expected an object with one of serverName (${NAME_RULES.denied.describes}), serverCommand (a non-empty list of texts) or serverUrl (a text)`,
};

/** What a value that is no list becomes, per list. */
const NOT_A_LIST: { readonly [L in McpList]: Repair } = {
  allowed: (_value, at) =>
    at.closed
      ? failedClosed(at, [], 'an empty allowlist: no server a user adds is admitted')
      : dropped(at, `"${at.key}" must be a list of entries`),
  denied: (_value, at) => dropped(at, `"${at.key}" must be a list of entries`),
};

/** The one entry as the settings file writes it, so the repaired value keeps the SDK's shape. */
const written = (entry: McpEntry): Readonly<Record<string, unknown>> => ({
  [entry.kind]: entry.value,
});

const repairOf =
  (list: McpList): Repair =>
  (value, at) => {
    if (!Array.isArray(value)) return NOT_A_LIST[list](value, at);
    const { entries, issues } = stripInvalid(
      value,
      at,
      (raw) => {
        const entry = readMcpEntry(raw, list);
        return entry === undefined ? undefined : written(entry);
      },
      REASONS[list],
    );
    return kept(entries, issues);
  };

export const allowedMcpServers: Repair = repairOf('allowed');
export const deniedMcpServers: Repair = repairOf('denied');
