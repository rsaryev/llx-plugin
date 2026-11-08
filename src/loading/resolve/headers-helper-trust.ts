import type { HelperContext, TrustGate } from './headers-helper-origins.ts';

/**
 * How a folder came to be trusted (mcp.md, "Trust a folder before its headersHelper runs"). Only the
 * folder's own persisted trust counts: "a parent folder's trust, and the automatic trust a `claude -p`
 * or SDK session gets for hooks in settings files" do not. The host says which it has; the kit reads
 * no dialog and no `~/.claude.json` but through `persistedTrust`.
 */
export const TRUST_SOURCES = ['persisted', 'parent-folder', 'automatic-session', 'none'] as const;
export type TrustSource = (typeof TRUST_SOURCES)[number];

const COUNTS: { readonly [S in TrustSource]: boolean } = {
  persisted: true,
  'parent-folder': false,
  'automatic-session': false,
  none: false,
};

export interface HelperTrust {
  /** How the folder the server is declared in came to be trusted. */
  readonly source: TrustSource;
  /** The folder trust is keyed on (permissions.md, "Project allow rules and workspace trust"). */
  readonly key: string;
  /** An interactive session; the refusal goes to the debug log there and to stderr otherwise. */
  readonly interactive: boolean;
}

const recordOf = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null
    ? Object.fromEntries(Object.entries(value))
    : undefined;

/**
 * "Set `projects["<path>"].hasTrustDialogAccepted` to `true` in `~/.claude.json`": that folder's
 * persisted trust, read from the parsed file. Another path's entry, a parent's, a non-`true` value
 * and a file of another shape are no trust.
 */
export function persistedTrust(claudeJson: unknown, key: string): TrustSource {
  const projects = recordOf(recordOf(claudeJson)?.projects);
  const entry =
    projects !== undefined && Object.hasOwn(projects, key) ? recordOf(projects[key]) : undefined;
  return entry?.hasTrustDialogAccepted === true ? 'persisted' : 'none';
}

export interface HelperNotice {
  readonly text: string;
  /** "Claude Code writes this line in non-interactive mode only"; an interactive session logs it. */
  readonly channel: 'stderr' | 'debug-log';
}

/** The line errors.md quotes under "headersHelper not run". */
function refusal(name: string, trust: HelperTrust, context: HelperContext): HelperNotice {
  const file = context.locations.joinPath(context.locations.homeDir(), '.claude.json');
  return {
    text: `MCP server '${name}': headersHelper not run — this workspace has no persisted trust; accept the trust dialog here once interactively, or set projects["${trust.key}"].hasTrustDialogAccepted in ${file}.`,
    channel: trust.interactive ? 'debug-log' : 'stderr',
  };
}

/** Whether the gate lets the helper through; otherwise what the host does instead. */
export type GateResult =
  | { readonly open: true }
  | { readonly open: false; readonly loaded: true; readonly notice: HelperNotice }
  | { readonly open: false; readonly loaded: false };

const OPEN: GateResult = { open: true };

type Gate = (name: string, trust: HelperTrust, context: HelperContext) => GateResult;

/**
 * `helper`: a project or local server connects with its static `headers` alone, with the notice.
 * `load`: an agent file's inline server from the project or an `--add-dir` directory "doesn't load at
 * all" until that folder is trusted.
 */
const GATES: { readonly [G in TrustGate]: Gate } = {
  none: () => OPEN,
  helper: (name, trust, context) =>
    COUNTS[trust.source]
      ? OPEN
      : { open: false, loaded: true, notice: refusal(name, trust, context) },
  load: (_name, trust) => (COUNTS[trust.source] ? OPEN : { open: false, loaded: false }),
};

export const passGate = (
  gate: TrustGate,
  name: string,
  trust: HelperTrust,
  context: HelperContext,
): GateResult => GATES[gate](name, trust, context);
