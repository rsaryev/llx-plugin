import { warning, type PluginIssue } from '../../format/issues.ts';
import { evaluateRules } from '../../rules/index.ts';
import { toolNameMatches } from '../../rules/tool-pattern.ts';
import type { MatchContext, PermissionRule } from '../../rules/types.ts';
import { AGENT_SCOPE_RULES, BUILTIN_PRIORITY } from './scopes.ts';
import type { ScannedAgent } from './scan.ts';
import type { CatalogAgent, CatalogSource } from './types.ts';

/**
 * Which definition a name means (sub-agents.md, "Choose the subagent scope": "When multiple subagents
 * share the same name, Claude Code uses the one from the higher-priority location"; "the definition
 * closest to the working directory" among nested project directories; a user or project subagent
 * named `Explore` overrides the built-in) and which subagents the settings switch off ("Disable
 * specific subagents": `Agent(name)` deny rules, or the `Agent` tool itself).
 */

export interface AgentSources {
  readonly builtin?: readonly CatalogAgent[];
  /** The `--agents` flag's agents. */
  readonly flag?: readonly CatalogAgent[];
  /** The files of the managed, project, user and added folders, as `scanAgents` read them. */
  readonly scanned?: readonly ScannedAgent[];
  /** The agents of the enabled plugins, under their scoped names. */
  readonly plugin?: readonly CatalogAgent[];
  /** The permission rules of the session; only deny rules matter here (settings and `--disallowedTools`). */
  readonly denied?: readonly PermissionRule[];
}

export interface Shadowed {
  readonly agent: CatalogAgent;
  /** The definition that took the name. */
  readonly by: CatalogAgent;
}

export interface AgentCatalog {
  /** The subagents a session can run, highest priority first. */
  readonly agents: readonly CatalogAgent[];
  /** Removed by a deny rule: the built-in or custom subagents that were defined. */
  readonly disabled: readonly CatalogAgent[];
  /** Definitions that lost their name to a higher-priority one. */
  readonly shadowed: readonly Shadowed[];
  /** Two files of one agents directory with one name. */
  readonly issues: readonly PluginIssue[];
  /** False when a deny rule names the `Agent` tool itself: no subagent can be spawned. */
  readonly delegation: boolean;
}

/** The Priority column of the table; a built-in comes after every source of it. */
const PRIORITY: { readonly [S in CatalogSource]: number } = {
  managed: AGENT_SCOPE_RULES.managed.priority,
  flag: AGENT_SCOPE_RULES.flag.priority,
  project: AGENT_SCOPE_RULES.project.priority,
  user: AGENT_SCOPE_RULES.user.priority,
  plugin: AGENT_SCOPE_RULES.plugin.priority,
  builtin: BUILTIN_PRIORITY,
};

interface Candidate {
  readonly agent: CatalogAgent;
  readonly order: number;
  readonly canonical?: string;
}

/** Code-unit order: the same on every machine, unlike a locale's. */
export const byCode = (a: string, b: string): number => Number(a > b) - Number(a < b);

const compare = (a: Candidate, b: Candidate): number =>
  PRIORITY[a.agent.source] - PRIORITY[b.agent.source] ||
  a.order - b.order ||
  byCode(a.agent.path ?? '', b.agent.path ?? '');

const plain = (agents: readonly CatalogAgent[] | undefined): Candidate[] =>
  (agents ?? []).map((agent) => ({ agent, order: 0 }));

function candidatesOf(sources: AgentSources): Candidate[] {
  const scanned = (sources.scanned ?? []).map((entry) => ({
    agent: entry.agent,
    order: entry.order,
    ...(entry.canonical === undefined ? {} : { canonical: entry.canonical }),
  }));
  return [
    ...plain(sources.builtin),
    ...plain(sources.flag),
    ...scanned,
    ...plain(sources.plugin),
  ].toSorted(compare);
}

/** Two names for one file (a symbolic link) are one agent: the first, by rank, stands. */
function withoutAliases(candidates: readonly Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return candidates.filter(({ agent, canonical }) => {
    if (canonical === undefined) return true;
    const key = `${agent.source}|${canonical}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The rules cannot see paths in an agent rule; this context only satisfies the matcher's signature. */
const NAMES_ONLY: MatchContext = {
  paths: {
    cwd: '/',
    home: '/',
    primaryWorkingDirectory: '/',
    additionalDirectories: [],
    platform: 'posix',
  },
};

const AGENT_TOOL = 'Agent';

/** A bare `Agent` deny rule: the tool itself, which "prevents Claude from delegating to any subagent". */
const deniesTool = (rules: readonly PermissionRule[]): boolean =>
  rules.some((rule) => rule.specifier === undefined && toolNameMatches(rule, AGENT_TOOL));

const isDisabled = (rules: readonly PermissionRule[], name: string): boolean =>
  evaluateRules(rules, { toolName: AGENT_TOOL, input: { subagent_type: name } }, NAMES_ONLY)
    .behavior === 'deny';

interface Grouped {
  readonly winners: CatalogAgent[];
  readonly shadowed: Shadowed[];
  readonly issues: PluginIssue[];
}

const sameFolder = (a: Candidate, b: Candidate): boolean =>
  a.agent.source === b.agent.source && a.order === b.order;

/** Sorted candidates, one winner per name; the rest are shadowed (and a same-folder twin is a warning). */
function groupByName(candidates: readonly Candidate[]): Grouped {
  const first = new Map<string, Candidate>();
  const grouped: Grouped = { winners: [], shadowed: [], issues: [] };
  for (const candidate of candidates) {
    const holder = first.get(candidate.agent.name);
    if (holder === undefined) {
      first.set(candidate.agent.name, candidate);
      grouped.winners.push(candidate.agent);
      continue;
    }
    grouped.shadowed.push({ agent: candidate.agent, by: holder.agent });
    if (sameFolder(holder, candidate)) {
      grouped.issues.push(
        warning(
          candidate.agent.path ?? candidate.agent.name,
          // Judgment (spec/judgments.md): the docs leave the choice to "filesystem read order"; the
          // kit takes the first path in sorted order so the answer does not change between runs.
          `Agent "${candidate.agent.name}" is defined here and in ${holder.agent.path ?? 'another file'}, in the same directory; only that one loads`,
        ),
      );
    }
  }
  return grouped;
}

/** The agents of every source, one definition per name, minus what a deny rule switched off. */
export function resolveAgents(sources: AgentSources = {}): AgentCatalog {
  const rules = (sources.denied ?? []).filter((rule) => rule.behavior === 'deny');
  const grouped = groupByName(withoutAliases(candidatesOf(sources)));
  const delegation = !deniesTool(rules);
  const off = grouped.winners.filter((agent) => !delegation || isDisabled(rules, agent.name));
  return {
    agents: grouped.winners.filter((agent) => !off.includes(agent)),
    disabled: off,
    shadowed: grouped.shadowed,
    issues: grouped.issues,
    delegation,
  };
}

export type SubagentTypeOutcome =
  | { readonly ok: true; readonly agent: CatalogAgent }
  | { readonly ok: false; readonly message: string };

const FALLBACK = 'general-purpose';

const listing = (catalog: AgentCatalog): string =>
  catalog.agents
    .map((agent) => agent.name)
    .toSorted(byCode)
    .join(', ');

/**
 * The subagent an Agent tool call runs (sub-agents.md, "Built-in subagents": "An Agent tool call that
 * omits `subagent_type` fails with `subagent_type is required` when the session has no
 * `general-purpose` subagent to fall back on"; errors.md, "subagent_type is required"). The message
 * lists the subagents the session has so Claude can retry with one of them. Judgment (spec/judgments.md):
 * the list is alphabetical, and a type the session does not have, or one a deny rule switched off, gets
 * the same list under a message of the kit's own.
 */
export function resolveSubagentType(
  catalog: AgentCatalog,
  subagentType: string | undefined,
): SubagentTypeOutcome {
  if (!catalog.delegation) {
    return { ok: false, message: 'The Agent tool is not available' };
  }
  const wanted = subagentType ?? FALLBACK;
  const agent = catalog.agents.find((each) => each.name === wanted);
  if (agent !== undefined) return { ok: true, agent };
  const available = `Available agents: ${listing(catalog)}`;
  return {
    ok: false,
    message:
      subagentType === undefined
        ? `subagent_type is required: the general-purpose agent is not available in this session. ${available}`
        : `Agent type '${subagentType}' not found. ${available}`,
  };
}
