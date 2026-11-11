import type { CatalogSource } from '../agents/catalog/index.ts';
import type { Command, Skill } from '../format/skill-types.ts';
import type { AgentDefinition } from '../protocol/official.ts';
import { planPreloadedSkills, type PreloadPlan } from '../agents/index.ts';
import { invocationPolicy, skillLookup } from '../skills/index.ts';
import type { Entry } from './session-skill-entries.ts';
import { contentOf } from './session-skill-expand.ts';
import type { HostState } from './state.ts';

export interface PreloadedSkills {
  /** The listed skills with their full content, in the list's order. */
  readonly preloaded: readonly (Skill | Command)[];
  readonly skipped: PreloadPlan['skipped'];
}

/** What `session.preloadSkills` takes besides the definition. */
export interface PreloadOptions {
  readonly signal: AbortSignal;
  /**
   * The agent's `CatalogAgent.source`: a plugin agent's bare name is looked for in its own plugin
   * before the other plugins. Without it the agent is read as one of no plugin.
   */
  readonly source?: CatalogSource | undefined;
}

const pluginIdOf = (source: CatalogSource | undefined): string | undefined =>
  source !== undefined && 'pluginId' in source ? source.pluginId : undefined;

/** A plugin entry that answers to `<its plugin>:<name>`; `pluginId` narrows it to one plugin. */
const pluginSkillNamed = (entry: Entry, name: string, pluginId: string | undefined): boolean =>
  entry.plugin !== undefined &&
  (pluginId === undefined || entry.plugin.id === pluginId) &&
  entry.names.includes(`${entry.plugin.plugin.name}:${name}`);

/**
 * The skill a listed name preloads, among the skills Claude can invoke. Oracle 2.1.322
 * (spec/judgments.md): the exact name (every name a skill answers to, as `expandSkill` finds it);
 * else, for a plugin agent, its own plugin's `<plugin>:<name>`; else the first plugin, in load
 * order, with a skill `<plugin>:<name>`.
 */
function resolverOf(entries: readonly Entry[], state: HostState, source?: CatalogSource) {
  const overrides = state.view.get('skillOverrides');
  const invocable = entries.filter(
    (entry) => invocationPolicy(entry.invocable, overrides).preloadable,
  );
  const exact = skillLookup(invocable);
  const known = skillLookup(entries);
  const own = pluginIdOf(source);
  const ownSkill = (name: string): Entry | undefined =>
    own === undefined ? undefined : invocable.find((each) => pluginSkillNamed(each, name, own));
  const find = (name: string): Entry | undefined =>
    exact.find(name) ??
    ownSkill(name) ??
    invocable.find((each) => pluginSkillNamed(each, name, undefined));
  const exists = (name: string): boolean =>
    known.find(name) !== undefined ||
    entries.some((each) => pluginSkillNamed(each, name, undefined));
  return { find, exists };
}

/** The plan over the session's catalog, then each planned skill's body as its file holds it now. */
export async function preloadFrom(
  entries: readonly Entry[],
  state: HostState,
  request: PreloadOptions & { readonly definition: Pick<AgentDefinition, 'skills'> },
): Promise<PreloadedSkills> {
  const resolver = resolverOf(entries, state, request.source);
  const plan = planPreloadedSkills(request.definition.skills, {
    has: resolver.exists,
    isModelInvocable: (name) => resolver.find(name) !== undefined,
  });
  const preloaded: (Skill | Command)[] = [];
  const skipped = [...plan.skipped];
  for (const name of plan.load) {
    const entry = resolver.find(name);
    const content = entry === undefined ? undefined : await contentOf(entry, request.signal);
    if (content === undefined || 'ok' in content) skipped.push({ name, reason: 'missing' });
    else preloaded.push(content);
  }
  return { preloaded, skipped };
}
