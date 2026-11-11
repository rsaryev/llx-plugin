import {
  AGENT_FIELDS,
  AGENT_FIELD_NAMES,
  type AgentFieldName,
  type AgentFieldValue,
} from './agent-fields.ts';
import type { PluginIssue } from './issues.ts';

/** `name` and `description`: `readAgent` reads them itself, as their problems decide if the file loads. */
type OwnFieldName = 'name' | 'description';
export type ReadFieldName = Exclude<AgentFieldName, OwnFieldName>;

const READ_FIELD_NAMES = AGENT_FIELD_NAMES.filter(
  (name): name is ReadFieldName => name !== 'name' && name !== 'description',
);

type Draft = { -readonly [F in ReadFieldName]?: AgentFieldValue<F> };

/** What the registry read from a file's frontmatter. */
export interface AgentFieldsRead {
  /** The fields that came out usable, typed by name. */
  readonly values: Readonly<Draft>;
  /** Fields in the file that Claude Code does not apply for a plugin agent (components.md). */
  readonly ignored: readonly ReadFieldName[];
  readonly issues: readonly PluginIssue[];
}

function readInto<F extends ReadFieldName>(
  draft: { -readonly [K in F]?: AgentFieldValue<K> },
  name: F,
  raw: unknown,
  path: string,
): readonly PluginIssue[] {
  const read = AGENT_FIELDS[name].read(path, name, raw);
  if (read.value !== undefined) draft[name] = read.value;
  return read.issues;
}

/**
 * Reads every field of the registry beyond `name` and `description` from the frontmatter table.
 * A plugin agent skips the fields it ignores (and names them in `ignored` when the file has them).
 */
export function readAgentFields(
  fields: Readonly<Record<string, unknown>>,
  options: { readonly plugin: boolean; readonly path: string },
): AgentFieldsRead {
  const values: Draft = {};
  const ignored: ReadFieldName[] = [];
  const issues: PluginIssue[] = [];
  for (const name of READ_FIELD_NAMES) {
    if (!Object.hasOwn(fields, name)) continue;
    if (options.plugin && AGENT_FIELDS[name].plugin === 'ignored') ignored.push(name);
    else issues.push(...readInto(values, name, fields[name], options.path));
  }
  return { values, ignored, issues };
}
