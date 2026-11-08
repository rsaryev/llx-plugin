import { readMcpServer, type PluginMcpServer } from '../../format/mcp-config.ts';
import { isRecord } from '../record.ts';
import { mentionsVariable } from './origins.ts';

/**
 * What a `managedMcpServers` entry may contain (managed-mcp.md, "What an entry can contain"): "Claude
 * Code loads an entry only when it passes every check below". A check returns why the entry fails it,
 * or `undefined`; they run in the order of the page's list (type, url, program members, `${VAR}`, then the
 * name and the invisible characters), the first failure is the notice.
 */
type Check = (name: string, entry: Record<string, unknown>) => string | undefined;

/** "only letters, numbers, hyphens, and underscores". */
const NAME = /^[A-Za-z0-9_-]+$/;

/**
 * "control or invisible formatting characters": the Unicode control and format categories, and the
 * line and paragraph separators (spec/judgments.md).
 */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

/** The two transports the page allows, and the alias `.mcp.json` accepts for `http`. */
const TRANSPORTS: readonly unknown[] = ['http', 'sse', 'streamable-http'];

/** "no `command`, `args`, `env`, or `headersHelper` member, so a managed settings document never names a program". */
const PROGRAM_MEMBERS = ['command', 'args', 'env', 'headersHelper'] as const;

interface Texts {
  readonly keys: readonly string[];
  readonly values: readonly string[];
}

const join = (list: readonly Texts[]): Texts => ({
  keys: list.flatMap((each) => each.keys),
  values: list.flatMap((each) => each.values),
});

/** Every key and every string value in an entry, at any depth. */
function textsOf(value: unknown): Texts {
  if (typeof value === 'string') return { keys: [], values: [value] };
  if (Array.isArray(value)) return join(value.map(textsOf));
  if (!isRecord(value)) return { keys: [], values: [] };
  const nested = join(Object.values(value).map(textsOf));
  return { keys: [...Object.keys(value), ...nested.keys], values: nested.values };
}

const isHttps = (url: unknown): boolean =>
  typeof url === 'string' && URL.canParse(url) && new URL(url).protocol === 'https:';

const CHECKS: readonly Check[] = [
  (_, entry) =>
    TRANSPORTS.includes(entry.type) ? undefined : 'its "type" must be "http" or "sse"',
  (_, entry) => (isHttps(entry.url) ? undefined : 'its "url" must be an https:// URL'),
  (_, entry) => {
    const member = PROGRAM_MEMBERS.find((each) => Object.hasOwn(entry, each));
    return member === undefined
      ? undefined
      : `it has a "${member}" member, and managed settings never name a program to run`;
  },
  (_, entry) =>
    textsOf(entry).values.some(mentionsVariable)
      ? 'it contains a ${VAR} reference, and environment variables are not expanded in managed entries'
      : undefined,
  (name) =>
    NAME.test(name)
      ? undefined
      : 'the name may hold only letters, numbers, hyphens and underscores',
  (name, entry) => {
    const { keys, values } = textsOf(entry);
    return [name, ...keys, ...values].some((text) => INVISIBLE.test(text))
      ? 'a key or value contains control or invisible formatting characters'
      : undefined;
  },
];

export interface ManagedEntryRead {
  /** The server, or why Claude Code drops the entry. */
  readonly server: PluginMcpServer | undefined;
  readonly reason: string | undefined;
}

/** One entry of `managedMcpServers`: every check, then the shape of a remote `.mcp.json` server. */
export function readManagedEntry(name: string, raw: unknown): ManagedEntryRead {
  if (!isRecord(raw)) return { server: undefined, reason: 'the entry must be an object' };
  for (const check of CHECKS) {
    const reason = check(name, raw);
    if (reason !== undefined) return { server: undefined, reason };
  }
  const read = readMcpServer(name, raw, 'managedMcpServers');
  return read.server === undefined
    ? { server: undefined, reason: read.issues.map((issue) => issue.message).join('; ') }
    : { server: read.server, reason: undefined };
}
