import { z } from 'zod';
import { error, type PluginIssue } from './issues.ts';

/**
 * LSP server entries of a plugin (plugins/manifest-reference.md, "lspServers"; plugins/components.md,
 * "LSP servers"). The SDK has no LSP config type (no match in sdk.d.ts), so `LspServer` is the kit's,
 * transcribed from the field table: "Each server config is a strict object with these fields. An
 * unknown key fails validation."
 */

/** `stdio` (default) or `socket`: "Claude Code accepts `socket` but runs every server over stdio". */
export const LSP_TRANSPORTS = ['stdio', 'socket'] as const;
export type LspTransport = (typeof LSP_TRANSPORTS)[number];

export interface LspServer {
  /** Language server binary: no whitespace unless the value starts with `/`. */
  readonly command: string;
  /** File extension (with its dot) to LSP language ID; at least one entry. */
  readonly extensionToLanguage: Readonly<Record<string, string>>;
  readonly args?: readonly string[];
  readonly transport?: LspTransport;
  readonly env?: Readonly<Record<string, string>>;
  /** Sent in the initialize request. Any JSON value. */
  readonly initializationOptions?: unknown;
  /** Sent by `workspace/didChangeConfiguration`. Any JSON value. */
  readonly settings?: unknown;
  readonly workspaceFolder?: string;
  /** Milliseconds, a positive integer. */
  readonly startupTimeout?: number;
  /** Milliseconds, a positive integer; unset means no timeout. */
  readonly shutdownTimeout?: number;
  /** Milliseconds, a positive integer; Claude Code defaults to 60000. */
  readonly requestTimeout?: number;
  /** Claude Code defaults to `true`. */
  readonly restartOnCrash?: boolean;
  /** Restart attempts before giving up, zero or more. */
  readonly maxRestarts?: number;
  /** Claude Code defaults to `true`. */
  readonly diagnostics?: boolean;
}

/** The fourteen rows of the table. */
export const LSP_FIELDS = [
  'command',
  'extensionToLanguage',
  'args',
  'transport',
  'env',
  'initializationOptions',
  'settings',
  'workspaceFolder',
  'startupTimeout',
  'shutdownTimeout',
  'requestTimeout',
  'restartOnCrash',
  'maxRestarts',
  'diagnostics',
] as const satisfies readonly (keyof LspServer)[];

const text = z.string({ error: 'expected a string' });
const strings = z.record(text, text, { error: 'expected a map of strings' });
const positive = z
  .number({ error: 'expected a positive integer of milliseconds' })
  .int({ error: 'expected an integer' })
  .positive({ error: 'must be a positive integer' });
const flag = z.boolean({ error: 'expected true or false' });

/** "No spaces unless the value starts with `/`; put arguments in `args`" (judgment: any whitespace, and not empty). */
const command = text
  .min(1, { error: 'must name a binary' })
  .refine((value) => value.startsWith('/') || !/\s/.test(value), {
    error: 'must not contain spaces unless it starts with "/"; put arguments in "args"',
  });

const withoutDot = (map: Readonly<Record<string, string>>): string[] =>
  Object.keys(map).filter((key) => !key.startsWith('.'));

const extensions = strings.check((context) => {
  const map = context.value;
  if (Object.keys(map).length === 0) {
    context.issues.push({ code: 'custom', input: map, message: 'needs at least one entry' });
  }
  const bare = withoutDot(map);
  if (bare.length > 0) {
    context.issues.push({
      code: 'custom',
      input: map,
      message: `every key must start with a dot, such as ".go"; no dot in ${bare.map((key) => `"${key}"`).join(', ')}`,
    });
  }
});

const lspServerSchema = z.strictObject({
  command,
  extensionToLanguage: extensions,
  args: z.array(text, { error: 'expected an array of strings' }).exactOptional(),
  transport: z.enum(LSP_TRANSPORTS, { error: 'must be "stdio" or "socket"' }).exactOptional(),
  env: strings.exactOptional(),
  initializationOptions: z.unknown().exactOptional(),
  settings: z.unknown().exactOptional(),
  workspaceFolder: text.exactOptional(),
  startupTimeout: positive.exactOptional(),
  shutdownTimeout: positive.exactOptional(),
  requestTimeout: positive.exactOptional(),
  restartOnCrash: flag.exactOptional(),
  maxRestarts: z
    .number({ error: 'expected an integer of zero or more' })
    .int({ error: 'expected an integer' })
    .nonnegative({ error: 'must be zero or more' })
    .exactOptional(),
  diagnostics: flag.exactOptional(),
}) satisfies z.ZodType<LspServer>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const reason = (failure: z.ZodError): string =>
  failure.issues
    .map((found) =>
      found.path.length > 0 ? `${found.path.join('.')}: ${found.message}` : found.message,
    )
    .join('; ');

/** `Invalid LSP server config for ".lsp.json"` is the prefix components.md quotes. */
const invalid = (origin: string, why: string): PluginIssue =>
  error(origin, `Invalid LSP server config for "${origin}": ${why}`);

export interface LspServerRead {
  /** Undefined when Claude Code would not load the entry. */
  readonly server: LspServer | undefined;
  readonly issues: readonly PluginIssue[];
}

/** One entry of a map; `origin` is the file (or `lspServers` for an inline map) it came from. */
export function readLspServer(name: string, raw: unknown, origin: string): LspServerRead {
  if (!isRecord(raw))
    return { server: undefined, issues: [invalid(origin, `${name}: expected an object`)] };
  const parsed = lspServerSchema.safeParse(raw);
  return parsed.success
    ? { server: parsed.data, issues: [] }
    : { server: undefined, issues: [invalid(origin, `${name}: ${reason(parsed.error)}`)] };
}

export interface LspConfigRead {
  readonly servers: Record<string, LspServer>;
  readonly issues: PluginIssue[];
}

/**
 * The servers of one map: a `.lsp.json` (or another `.json` file `lspServers` names) or an inline
 * map. Components.md: "The file maps each server name directly to its configuration, with no
 * wrapper object", and "When any entry is invalid, the whole file is skipped at load": one invalid
 * entry leaves no server from this map. Judgment: an inline map is read the same way, since the
 * manifest check rejects the plugin for a bad entry anyway.
 */
export function readLspConfig(raw: unknown, origin: string): LspConfigRead {
  if (!isRecord(raw)) {
    return { servers: {}, issues: [invalid(origin, 'expected an object keyed by server name')] };
  }
  const reads = Object.entries(raw).map(([name, entry]) => ({
    name,
    ...readLspServer(name, entry, origin),
  }));
  const issues = reads.flatMap((read) => [...read.issues]);
  return {
    servers: issues.length > 0 ? {} : entriesOf(reads),
    issues,
  };
}

// `fromEntries` defines own properties, so a server called `__proto__` stays a plain entry.
const entriesOf = (reads: readonly { name: string; server: LspServer | undefined }[]) =>
  Object.fromEntries(
    reads.flatMap(({ name, server }) => (server ? [[name, server] as const] : [])),
  );

/**
 * Joins the maps of a plugin in loading order: `.lsp.json` first, then each declared source
 * (manifest-reference: "A server name declared later replaces an earlier one"; components.md: the
 * manifest server replaces the `.lsp.json` one of the same name). Judgment: replacement is of the
 * whole entry, and a replaced name keeps its first position, so the registration order that decides
 * which server keeps a shared extension is the order names first appeared. Limitation: the result is
 * a plain object, so integer-like names (`"9"`, `"10"`) come first in ascending order whatever their
 * position (spec/judgments.md).
 */
export function mergeLspSources(sources: readonly LspConfigRead[]): LspConfigRead {
  return {
    servers: Object.fromEntries(sources.flatMap(({ servers }) => Object.entries(servers))),
    issues: sources.flatMap(({ issues }) => issues),
  };
}
