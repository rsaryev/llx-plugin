import { byCodeUnit } from '../../format/listing.ts';
import type { AgentCatalog } from './resolve.ts';
import type { CatalogAgent } from './types.ts';

/**
 * Naming a subagent (sub-agents.md, "Invoke subagents explicitly"). Three patterns "escalate from a
 * one-off suggestion to a session-wide default": a name in the prompt (Claude decides, nothing to
 * parse), an @-mention (the subagent runs for that task) and the whole session as the subagent
 * (`--agent`, the `agent` setting). Pure over the catalog; the typeahead and the session start are the
 * host's.
 */

/** The typeahead's label: `code-reviewer (agent)`; "under their scoped name" for a plugin subagent. */
const labelOf = (agent: CatalogAgent): string => `${agent.name} (agent)`;

export interface TypeaheadEntry {
  readonly label: string;
  /** What picking it writes into the prompt: `@"code-reviewer (agent)"`. */
  readonly insert: string;
  readonly agent: CatalogAgent;
}

/**
 * The subagents to offer after `@`. Judgment (spec/judgments.md): a subagent a deny rule switched off is
 * not offered (nor mentioned); the docs say only that the rule stops Claude using it.
 */
export function agentTypeahead(catalog: AgentCatalog): readonly TypeaheadEntry[] {
  return catalog.agents.map((agent) => ({
    label: labelOf(agent),
    insert: `@"${labelOf(agent)}"`,
    agent,
  }));
}

export interface AgentMention {
  readonly agent: CatalogAgent;
  /** The mention as written, `@agent-test-runner`. */
  readonly text: string;
}

export interface MentionsFound {
  /** Each subagent once, in the order first mentioned. */
  readonly mentions: readonly AgentMention[];
  /**
   * The message Claude receives: "Your full message still goes to Claude, which writes the subagent's
   * task prompt ... The @-mention controls which subagent Claude invokes, not what prompt it receives."
   */
  readonly message: string;
}

/** `@"code-reviewer (agent)"`, written by the picker. */
const PICKED = /(?<![\w@])@"([^"]+) \(agent\)"/g;
/** `@agent-<name>`, typed: a name runs to the next space, and punctuation after it is not the name. */
const TYPED = /(?<![\w@])@agent-([^\s"@]+)/g;

interface Found {
  readonly index: number;
  readonly text: string;
  readonly agent: CatalogAgent;
}

const byName = (catalog: AgentCatalog): ReadonlyMap<string, CatalogAgent> =>
  new Map(catalog.agents.map((agent) => [agent.name, agent]));

/** The longest start of the typed token that names a subagent: `test-runner,` is `test-runner`. */
function longestKnown(token: string, known: ReadonlyMap<string, CatalogAgent>) {
  for (let end = token.length; end > 0; end -= 1) {
    const agent = known.get(token.slice(0, end));
    if (agent !== undefined) return { agent, length: end };
  }
  return undefined;
}

function pickedMentions(message: string, known: ReadonlyMap<string, CatalogAgent>): Found[] {
  return [...message.matchAll(PICKED)].flatMap((match) => {
    const agent = known.get(match[1] ?? '');
    return agent === undefined ? [] : [{ index: match.index, text: match[0], agent }];
  });
}

function typedMentions(message: string, known: ReadonlyMap<string, CatalogAgent>): Found[] {
  return [...message.matchAll(TYPED)].flatMap((match) => {
    const found = longestKnown(match[1] ?? '', known);
    if (found === undefined) return [];
    return [
      {
        index: match.index,
        text: `@agent-${(match[1] ?? '').slice(0, found.length)}`,
        agent: found.agent,
      },
    ];
  });
}

/**
 * The subagents a message mentions, from both spellings ("You can also type the mention manually without
 * using the picker: `@agent-<name>` for local subagents, or `@agent-` followed by the scoped name for
 * plugin subagents"). A name that is no subagent of the catalog selects nothing. Natural language is
 * not a mention: "Use the test-runner subagent" leaves the choice to Claude.
 */
export function agentMentions(message: string, catalog: AgentCatalog): MentionsFound {
  const known = byName(catalog);
  const found = [...pickedMentions(message, known), ...typedMentions(message, known)].toSorted(
    (a, b) => a.index - b.index,
  );
  const seen = new Set<string>();
  const mentions = found.flatMap(({ agent, text }) => {
    if (seen.has(agent.name)) return [];
    seen.add(agent.name);
    return [{ agent, text }];
  });
  return { mentions, message };
}

/**
 * Where the choice of the session agent came from: `--agent` ("The CLI flag overrides the setting"),
 * the `agent` key of a settings source, or a plugin's default `agent` (plugins/components.md, "Default
 * settings": the lowest layer).
 */
export type SessionAgentSource = 'flag' | 'setting' | 'plugin';

/** The `agent` setting as the settings resolved it: the name, and the plugin when it is a plugin default. */
export interface AgentSetting {
  readonly name: string;
  /** The id of the plugin whose `settings.json` (or manifest `settings`) set it; absent for a settings source. */
  readonly plugin?: string;
}

export type SessionAgentChoice =
  | {
      readonly ok: true;
      readonly agent: CatalogAgent | undefined;
      readonly from?: SessionAgentSource;
      /** With `from: 'plugin'`: the id of the plugin whose default chose it. */
      readonly plugin?: string;
    }
  | {
      readonly ok: false;
      readonly message: string;
      /**
       * The agents the name could mean, in code-unit order of their scoped names: two or more for a
       * bare name several plugins provide, none for a name no agent has.
       */
      readonly candidates: readonly CatalogAgent[];
    };

/** Every subagent the person may choose: a deny rule stops delegation to one, not choosing it as the session's. */
const choosable = (catalog: AgentCatalog): readonly CatalogAgent[] => [
  ...catalog.agents,
  ...catalog.disabled,
];

function lookup(catalog: AgentCatalog, wanted: string): SessionAgentChoice {
  const all = choosable(catalog);
  const exact = all.find((agent) => agent.name === wanted);
  if (exact !== undefined) return { ok: true, agent: exact };
  // "For a plugin-provided subagent, you can pass only the agent name and Claude Code finds it".
  const bare = all.filter((agent) => agent.ownName === wanted);
  const [only] = bare;
  if (bare.length === 1 && only !== undefined) return { ok: true, agent: only };
  if (bare.length > 1) {
    const candidates = bare.toSorted((a, b) => byCodeUnit(a.name, b.name));
    const scoped = candidates.map((agent) => agent.name);
    return {
      ok: false,
      message: `Agent "${wanted}" is provided by several plugins; pass the scoped name: ${scoped.join(', ')}`,
      candidates,
    };
  }
  return { ok: false, message: `No subagent named "${wanted}"`, candidates: [] };
}

/**
 * The subagent a session runs as: `--agent <name>` over the `agent` setting ("`--agent` takes
 * precedence over this key for one session"), the setting as `valueWithPluginDefaults` resolved it (a
 * settings source over the plugins' defaults). Oracle 2.1.322 (spec/judgments.md): a plugin's default
 * names an agent the way the setting does, so a user agent of that exact name wins over the plugin's own.
 * Judgment (spec/judgments.md): the docs name no failure for an unknown name, so the message is the
 * kit's, and a deny rule `Agent(name)` does not stop the person choosing it as the main thread.
 */
export function selectSessionAgent(
  catalog: AgentCatalog,
  choice: { readonly flag?: string | undefined; readonly setting?: AgentSetting | undefined },
): SessionAgentChoice {
  const { flag, setting } = choice;
  if (flag !== undefined) {
    const found = lookup(catalog, flag);
    return found.ok ? { ...found, from: 'flag' } : found;
  }
  if (setting === undefined) return { ok: true, agent: undefined };
  const found = lookup(catalog, setting.name);
  if (!found.ok) return found;
  return setting.plugin === undefined
    ? { ...found, from: 'setting' }
    : { ...found, from: 'plugin', plugin: setting.plugin };
}

/** The startup header's mark: "The agent name appears as `@<name>`". */
export const sessionAgentLabel = (agent: CatalogAgent): string => `@${agent.name}`;

/** The built-in agent a session falls back to: its absence changes nothing, so it never warns. */
const DEFAULT_AGENT = 'claude';

export interface ResumedSessionAgent {
  readonly agent: CatalogAgent | undefined;
  /** Shown in the resumed conversation when the agent is gone. */
  readonly warning?: string;
}

/**
 * The agent of a resumed session (sub-agents.md: "the choice persists when you resume the session";
 * errors.md, "Session agent no longer available"). A missing one lets the session go on with the
 * default tools and a warning that names it and the directories searched.
 */
export function resumeSessionAgent(
  catalog: AgentCatalog,
  name: string,
  searched: readonly string[],
): ResumedSessionAgent {
  const found = lookup(catalog, name);
  if (found.ok) return { agent: found.agent };
  if (name === DEFAULT_AGENT) return { agent: undefined };
  return {
    agent: undefined,
    warning: `This session was running agent '${name}', which is no longer available (no agent by that name in ${searched.join(', ')}). Continuing with the default tools and system prompt — the agent's tool restrictions no longer apply. To restore it, re-create the agent, or resume with an explicit --agent <name>.`,
  };
}
