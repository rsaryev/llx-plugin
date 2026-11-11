import type { HooksSettings } from '../protocol/hook-config.ts';
import type { AgentDefinition } from '../protocol/official.ts';
import { AGENT_FIELD_NAMES, type AgentFieldName } from './agent-fields.ts';
import type { AgentExtras } from './agent-record.ts';
import { writeFrontmatter } from './frontmatter-write.ts';
import { INVOCABLE_DEFAULTS, SKILL_FIELDS, type SkillField } from './skill-fields.ts';
import type { InvocableFrontmatter } from './skill-types.ts';

/**
 * A skill, command or agent file from the kit's own definition types, the inverse of `readSkill`,
 * `readCommand` and `readAgent`: each documented key in its table's order (skills.md and
 * sub-agents.md, "Frontmatter reference"), written by `writeFrontmatter`, then the host's own keys
 * (`extra`) after them. A skill or command value equal to its documented default is left out, as an
 * author leaves it out; `shell` is the exception, since an explicit `shell: bash` "fails the
 * invocation" when bash is missing (skills.md, "How injected commands run").
 */

/** What an author sets of the shared fields: the read-only views (`frontmatter`, `undescribed`) are the reader's. */
export type InvocableDraft = Partial<
  Omit<InvocableFrontmatter, 'frontmatter' | 'undescribed' | 'shellDeclared'>
>;

export interface SkillDraft extends InvocableDraft {
  readonly name?: string;
  /** The Markdown after the frontmatter, written as given. */
  readonly body: string;
  /** Keys the kit does not model, written after the documented ones. */
  readonly extra?: Readonly<Record<string, unknown>>;
}

/** A command file takes neither `name` nor `paths` (the reader leaves both untaken). */
export interface CommandDraft extends Omit<InvocableDraft, 'paths'> {
  readonly body: string;
  readonly extra?: Readonly<Record<string, unknown>>;
}

export interface AgentDraft {
  readonly name: string;
  /** The official shape; `prompt` is the body. */
  readonly definition: AgentDefinition;
  readonly extras?: AgentExtras;
  readonly hooks?: HooksSettings;
  readonly extra?: Readonly<Record<string, unknown>>;
}

type InvocableProperty = keyof InvocableDraft | 'name';

/** Each skill key's property (K1: a registry typed over the keys). */
const INVOCABLE_PROPERTY: { readonly [K in SkillField]: InvocableProperty } = {
  name: 'name',
  description: 'description',
  when_to_use: 'whenToUse',
  'argument-hint': 'argumentHint',
  arguments: 'arguments',
  'disable-model-invocation': 'disableModelInvocation',
  'user-invocable': 'userInvocable',
  'allowed-tools': 'allowedTools',
  'disallowed-tools': 'disallowedTools',
  model: 'model',
  effort: 'effort',
  context: 'context',
  agent: 'agent',
  background: 'background',
  hooks: 'hooks',
  paths: 'paths',
  shell: 'shell',
  metadata: 'metadata',
  license: 'license',
  compatibility: 'compatibility',
};

const OMITTED_DEFAULTS: Readonly<Record<string, unknown>> = Object.fromEntries(
  Object.entries(INVOCABLE_DEFAULTS).filter(([property]) => property !== 'shell'),
);

const isDefault = (property: string, value: unknown): boolean => {
  const fallback = OMITTED_DEFAULTS[property];
  return Array.isArray(fallback)
    ? Array.isArray(value) && value.length === 0
    : fallback !== undefined && fallback === value;
};

function invocableFields(
  draft: Readonly<Partial<Record<InvocableProperty, unknown>>>,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const key of SKILL_FIELDS) {
    const property = INVOCABLE_PROPERTY[key];
    const value = draft[property];
    if (value !== undefined && !isDefault(property, value)) fields[key] = value;
  }
  return fields;
}

export function renderSkillFile(draft: SkillDraft): string {
  return writeFrontmatter({ ...invocableFields(draft), ...draft.extra }, draft.body);
}

/** A command file is a skill file without `name` and `paths`: the one writer. */
export function renderCommandFile(draft: CommandDraft): string {
  return renderSkillFile(draft);
}

/** Each agent key's value (K1); `experimental` holds the one key the kit keeps, `cacheTtl`. */
const AGENT_VALUE: { readonly [F in AgentFieldName]: (draft: AgentDraft) => unknown } = {
  name: (draft) => draft.name,
  description: (draft) => draft.definition.description,
  tools: (draft) => draft.definition.tools,
  disallowedTools: (draft) => draft.definition.disallowedTools,
  model: (draft) => draft.definition.model,
  permissionMode: (draft) => draft.definition.permissionMode,
  maxTurns: (draft) => draft.definition.maxTurns,
  autoCompactWindow: (draft) => draft.definition.autoCompactWindow,
  skills: (draft) => draft.definition.skills,
  mcpServers: (draft) => draft.definition.mcpServers,
  hooks: (draft) => draft.hooks,
  memory: (draft) => draft.definition.memory,
  background: (draft) => draft.definition.background,
  omitClaudeMd: (draft) => draft.definition.omitClaudeMd,
  effort: (draft) => draft.definition.effort,
  isolation: (draft) => draft.extras?.isolation,
  color: (draft) => draft.extras?.color,
  initialPrompt: (draft) => draft.definition.initialPrompt,
  experimental: (draft) =>
    draft.extras?.cacheTtl === undefined ? undefined : { cacheTtl: draft.extras.cacheTtl },
};

export function renderAgentFile(draft: AgentDraft): string {
  const fields = Object.fromEntries(AGENT_FIELD_NAMES.map((key) => [key, AGENT_VALUE[key](draft)]));
  return writeFrontmatter({ ...fields, ...draft.extra }, draft.definition.prompt);
}
