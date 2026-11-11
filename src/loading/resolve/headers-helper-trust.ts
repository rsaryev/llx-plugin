import { CONFIG_DIR_VARIABLE, globalConfigFileOf } from '../../format/config-directory.ts';
import { isRecord } from '../../protocol/is-record.ts';
import { contentGate, type RepositoryContent, type TrustSituation } from '../trust-gates.ts';
import type { HelperContext, TrustGate } from './headers-helper-origins.ts';

/**
 * How a folder came to be trusted (mcp.md, "Trust a folder before its headersHelper runs"). Only the
 * folder's own persisted trust counts: "a parent folder's trust, and the automatic trust a `claude -p`
 * or SDK session gets for hooks in settings files" do not. The host says which it has; the kit reads
 * no dialog and no `~/.claude.json` but through `persistedTrust`.
 */
export const TRUST_SOURCES = ['persisted', 'parent-folder', 'automatic-session', 'none'] as const;
export type TrustSource = (typeof TRUST_SOURCES)[number];

/**
 * The column of the trust table (`trust-gates`) each source is: only persisted trust is the folder's
 * own; the automatic trust of a `-p` or SDK session is the `claude -p` column.
 */
const SITUATION: { readonly [S in TrustSource]: TrustSituation } = {
  persisted: 'trusted',
  'parent-folder': 'parent-trusted',
  'automatic-session': 'non-interactive',
  none: 'dialog',
};

const counts = (content: RepositoryContent, trust: HelperTrust): boolean =>
  contentGate(content, SITUATION[trust.source]).applies;

export interface HelperTrust {
  /** How the folder the server is declared in came to be trusted. */
  readonly source: TrustSource;
  /** The folder trust is keyed on (permissions.md, "Project allow rules and workspace trust"). */
  readonly key: string;
  /** An interactive session; the refusal goes to the debug log there and to stderr otherwise. */
  readonly interactive: boolean;
}

/**
 * "Set `projects["<path>"].hasTrustDialogAccepted` to `true` in `~/.claude.json`": that folder's
 * persisted trust, read from the parsed file. Another path's entry, a parent's, a non-`true` value
 * and a file of another shape are no trust.
 */
export function persistedTrust(claudeJson: unknown, key: string): TrustSource {
  const projects = isRecord(claudeJson) ? claudeJson.projects : undefined;
  const entry = isRecord(projects) && Object.hasOwn(projects, key) ? projects[key] : undefined;
  return isRecord(entry) && entry.hasTrustDialogAccepted === true ? 'persisted' : 'none';
}

export interface HelperNotice {
  readonly text: string;
  /** "Claude Code writes this line in non-interactive mode only"; an interactive session logs it. */
  readonly channel: 'stderr' | 'debug-log';
}

/** The line errors.md quotes under "headersHelper not run". */
function refusal(name: string, trust: HelperTrust, context: HelperContext): HelperNotice {
  const { locations, environment } = context;
  const file = globalConfigFileOf(
    locations.homeDir(),
    environment[CONFIG_DIR_VARIABLE],
    locations.joinPath,
  );
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
    counts('headers-helper', trust)
      ? OPEN
      : { open: false, loaded: true, notice: refusal(name, trust, context) },
  load: (_name, trust) =>
    counts('subagent-inline-mcp', trust) ? OPEN : { open: false, loaded: false },
};

export const passGate = (
  gate: TrustGate,
  name: string,
  trust: HelperTrust,
  context: HelperContext,
): GateResult => GATES[gate](name, trust, context);
