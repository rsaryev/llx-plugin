import type { HooksSettings } from '../protocol/hook-config.ts';
import { normalizePermissionMode } from '../protocol/permission-modes.ts';
import type { AgentDefinition, AgentMcpServerSpec, EffortLevel } from '../protocol/official.ts';
import type { Assert, Equal } from '../protocol/type-equality.ts';
import {
  autoCompactWindow,
  boolField,
  effortField,
  enumField,
  experimentalMap,
  positiveInt,
  textField,
  tokenList,
  type AgentCoercer,
  type Experimental,
} from './agent-scalars.ts';
import { readHooksSettings } from './hooks-settings.ts';
import { warning } from './issues.ts';

/**
 * The 19 frontmatter fields of a subagent file (sub-agents.md, "Frontmatter reference"), in the
 * table's order. Claude Code "ignores a field it doesn't recognize", so anything else is
 * `unrecognized`.
 */
export const AGENT_FIELD_NAMES = [
  'name',
  'description',
  'tools',
  'disallowedTools',
  'model',
  'permissionMode',
  'maxTurns',
  'autoCompactWindow',
  'skills',
  'mcpServers',
  'hooks',
  'memory',
  'background',
  'omitClaudeMd',
  'effort',
  'isolation',
  'color',
  'initialPrompt',
  'experimental',
] as const;
export type AgentFieldName = (typeof AGENT_FIELD_NAMES)[number];

/** `color`: "Accepts `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, or `cyan`". */
export const AGENT_COLORS = [
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'orange',
  'pink',
  'cyan',
] as const;
export type AgentColor = (typeof AGENT_COLORS)[number];

/** `isolation`: "Set to `worktree`"; plugins/components.md: "The only valid `isolation` value". */
export const AGENT_ISOLATIONS = ['worktree'] as const;
export type AgentIsolation = (typeof AGENT_ISOLATIONS)[number];

/** `memory`: "`user`, `project`, or `local`", tied to the official `AgentDefinition`. */
export const AGENT_MEMORY_SCOPES = ['user', 'project', 'local'] as const;
export type AgentMemoryScope = (typeof AGENT_MEMORY_SCOPES)[number];

/** @public A compile-time drift guard: the typecheck fails when the SDK changes the union. */
export type MemoryScopesMatchSdk = Assert<
  Equal<AgentMemoryScope, NonNullable<AgentDefinition['memory']>>
>;

/** @public The `effort` field names the same levels as the SDK (a number is the SDK's extra). */
export type AgentEffortMatchesSdk = Assert<
  Equal<Extract<NonNullable<AgentDefinition['effort']>, string>, EffortLevel>
>;

/** What each field reads to. */
interface AgentFieldValues {
  readonly name: string;
  readonly description: string;
  readonly tools: string[];
  readonly disallowedTools: string[];
  readonly model: string;
  readonly permissionMode: NonNullable<AgentDefinition['permissionMode']>;
  readonly maxTurns: number;
  readonly autoCompactWindow: number;
  readonly skills: string[];
  readonly mcpServers: AgentMcpServerSpec[];
  readonly hooks: HooksSettings;
  readonly memory: AgentMemoryScope;
  readonly background: boolean;
  readonly omitClaudeMd: boolean;
  readonly effort: EffortLevel;
  readonly isolation: AgentIsolation;
  readonly color: AgentColor;
  readonly initialPrompt: string;
  readonly experimental: Experimental;
}

export type AgentFieldValue<F extends AgentFieldName> = AgentFieldValues[F];

export interface AgentFieldSpec<F extends AgentFieldName> {
  /**
   * plugins/components.md, "Frontmatter fields in plugin agents": a plugin agent applies a
   * `supported` field and ignores an `ignored` one.
   */
  readonly plugin: 'supported' | 'ignored';
  /** Coerces the raw YAML value; `path` is the agent file, for the issues. */
  readonly read: AgentCoercer<AgentFieldValue<F>>;
}

const supported = <F extends AgentFieldName>(
  read: AgentCoercer<AgentFieldValue<F>>,
): AgentFieldSpec<F> => ({ plugin: 'supported', read });

const ignoredInPlugins = <F extends AgentFieldName>(
  read: AgentCoercer<AgentFieldValue<F>>,
): AgentFieldSpec<F> => ({ plugin: 'ignored', read });

const isTable = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * An inline definition: a table with at least one key whose every value is a table (the server's
 * config). The config itself is the MCP reader's to validate, so only its outer shape is checked
 * here; the predicate stands in for the SDK's `McpServerConfigForProcessTransport` until that
 * reader exists (judgment, spec/judgments.md).
 */
const isInlineServer = (value: unknown): value is Exclude<AgentMcpServerSpec, string> =>
  isTable(value) && Object.keys(value).length > 0 && Object.values(value).every(isTable);

/** `permissionMode`: a mode, or `manual` for `default` (the one alias the docs name). */
const permissionMode: AgentCoercer<AgentFieldValue<'permissionMode'>> = (path, key, raw) => {
  const text = textField(path, key, raw);
  if (text.value === undefined) return { value: undefined, issues: text.issues };
  const mode = normalizePermissionMode(text.value);
  if (mode !== undefined) return { value: mode, issues: [] };
  const message = `Invalid "${key}": "${text.value}" is not a permission mode; the field is ignored`;
  return { value: undefined, issues: [warning(path, message)] };
};

/** `hooks`: the settings' hook format; what is wrong is reported and no hook is kept. */
const hooks: AgentCoercer<HooksSettings> = (path, key, raw) => {
  if (raw === undefined || raw === null) return { value: undefined, issues: [] };
  const read = readHooksSettings(raw);
  const issues = read.issues.map((issue) =>
    warning(path, `Invalid "${key}": ${issue.message}; the hooks are ignored`),
  );
  return { value: issues.length === 0 ? read.hooks : undefined, issues };
};

/**
 * `mcpServers`: "a server name referencing an already-configured server ... or an inline
 * definition with the server name as key and a full MCP server config as value". The config
 * itself is the MCP reader's to validate; an entry of another shape is dropped.
 */
const mcpServers: AgentCoercer<AgentMcpServerSpec[]> = (path, key, raw) => {
  if (raw === undefined || raw === null) return { value: undefined, issues: [] };
  if (!Array.isArray(raw)) {
    const message = `Invalid "${key}": it is not a list of server names and inline definitions; the field is ignored`;
    return { value: undefined, issues: [warning(path, message)] };
  }
  const entries: AgentMcpServerSpec[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string' && entry.trim() !== '') entries.push(entry.trim());
    else if (isInlineServer(entry)) entries.push(entry);
  }
  const issues =
    entries.length === raw.length
      ? []
      : [
          warning(
            path,
            `Invalid "${key}": some entries are neither a name nor a definition; they are ignored`,
          ),
        ];
  return { value: entries, issues };
};

/** The registry: one spec per field name, so a field added to the table fails the typecheck here. */
export const AGENT_FIELDS: { readonly [F in AgentFieldName]: AgentFieldSpec<F> } = {
  name: supported(textField),
  description: supported(textField),
  tools: supported(tokenList),
  disallowedTools: supported(tokenList),
  model: supported(textField),
  permissionMode: ignoredInPlugins(permissionMode),
  maxTurns: supported(positiveInt),
  autoCompactWindow: supported(autoCompactWindow),
  skills: supported(tokenList),
  mcpServers: ignoredInPlugins(mcpServers),
  hooks: ignoredInPlugins(hooks),
  memory: supported(enumField(AGENT_MEMORY_SCOPES)),
  background: supported(boolField),
  omitClaudeMd: supported(boolField),
  effort: supported(effortField),
  isolation: supported(enumField(AGENT_ISOLATIONS)),
  color: supported(enumField(AGENT_COLORS)),
  initialPrompt: ignoredInPlugins(textField),
  experimental: supported(experimentalMap),
};

/** The fields a plugin agent ignores (plugins/components.md): derived from the registry. */
export const PLUGIN_IGNORED_FIELDS: readonly AgentFieldName[] = AGENT_FIELD_NAMES.filter(
  (field) => AGENT_FIELDS[field].plugin === 'ignored',
);
