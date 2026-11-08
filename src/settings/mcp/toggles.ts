import { isRecord } from '../record.ts';
import { claudeJsonProject } from './candidates.ts';
import type { McpCandidate, McpScope } from './scope.ts';

/**
 * The per-project lists a toggle in `/mcp` writes to `~/.claude.json` (mcp.md, "Disable a server
 * without removing it"). They are unrelated to `enabledMcpjsonServers` and `disabledMcpjsonServers`.
 */
export interface ProjectToggles {
  readonly disabledMcpServers: readonly string[];
  readonly enabledMcpServers: readonly string[];
}

/**
 * What a toggle applies to: the six scopes, and the built-in servers, which the docs split by their
 * default (`computer-use` "defaults to off").
 */
export type ToggleSubject = McpScope | 'builtin' | 'builtinDefaultOff';

const textsOf = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

/** The two lists of one project's entry in the state file `~/.claude.json`, already parsed. */
export function readProjectToggles(state: unknown, projectPath: string): ProjectToggles {
  const entry = claudeJsonProject(state, projectPath);
  const lists = isRecord(entry) ? entry : {};
  return {
    disabledMcpServers: textsOf(lists.disabledMcpServers),
    enabledMcpServers: textsOf(lists.enabledMcpServers),
  };
}

interface ToggleRule {
  /** The one list this kind of server consults: "exactly one of the two lists for each server". */
  readonly list: keyof ProjectToggles;
  /** Whether a server its list names is on: no for the opt-out list, yes for the opt-in list. */
  readonly onWhenListed: boolean;
}

const OPT_OUT: ToggleRule = { list: 'disabledMcpServers', onWhenListed: false };
const OPT_IN: ToggleRule = { list: 'enabledMcpServers', onWhenListed: true };

const TOGGLE_RULES: { readonly [S in ToggleSubject]: ToggleRule } = {
  managed: OPT_OUT,
  local: OPT_OUT,
  project: OPT_OUT,
  user: OPT_OUT,
  plugin: OPT_OUT,
  connector: OPT_OUT,
  builtin: OPT_OUT,
  builtinDefaultOff: OPT_IN,
};

/** Whether the project's lists leave the server on. A name in the list the server does not consult is ignored. */
export function serverEnabled(
  toggles: ProjectToggles,
  subject: ToggleSubject,
  name: string,
): boolean {
  const rule = TOGGLE_RULES[subject];
  return toggles[rule.list].includes(name) === rule.onWhenListed;
}

/**
 * How a connector is written in the lists: "under its display name, for example `claude.ai Slack`"
 * (`/mcp` lists the connector Anthropic provides as `claude.ai Claude Docs`).
 */
export const connectorDisplayName = (connector: string): string => `claude.ai ${connector}`;

/** The candidates with `enabled` set from the project's lists; a disabled one stays, marked. */
export function applyToggles(
  candidates: readonly McpCandidate[],
  toggles: ProjectToggles,
): McpCandidate[] {
  return candidates.map((each) => ({
    ...each,
    enabled: serverEnabled(toggles, each.scope, each.name),
  }));
}
