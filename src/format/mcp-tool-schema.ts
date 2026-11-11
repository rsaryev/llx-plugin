import type { Tool } from '../protocol/official.ts';
import { checksMetaSchema, metaSchemaProblems, propertyNameProblems } from './mcp-schema-check.ts';
import { isRecord } from '../protocol/is-record.ts';

/**
 * What Claude Code does with a tool's input schema before the tool goes to the API (mcp.md, "Tool
 * input schemas with a root-level combinator", "Tools with invalid input schemas", "Tools whose input
 * schema the API refuses"): a root `anyOf`, `oneOf` or `allOf` is flattened into one object, a tool
 * whose schema the API would refuse is excluded (and Claude is told), and a tool the API did refuse
 * is declared without parameters. Pure over data; the log is returned, never written.
 */
export type McpToolDeclaration = Pick<Tool, 'name' | 'description'> & {
  readonly inputSchema: Readonly<Record<string, unknown>>;
};

/** A tool as a server listed it: its input schema is whatever the server sent, checked here. */
export type McpListedTool = Pick<Tool, 'name' | 'description'> & {
  readonly inputSchema: unknown;
};

export interface McpToolPolicy {
  /** The remote configuration that enables the rewrite of root-level combinators was received. */
  readonly rewriteRootCombinators: boolean;
  /**
   * The checks of "Tools with invalid input schemas" exclude the tool: false "when feature flag
   * fetching is off or the flags have never arrived" (the tool is sent and the log records it).
   */
  readonly excludeInvalid: boolean;
}

export type McpToolPreparation =
  | { readonly sent: true; readonly tool: McpToolDeclaration; readonly log: readonly string[] }
  | { readonly sent: false; readonly reasons: readonly string[]; readonly log: readonly string[] };

type Combinator = 'allOf' | 'anyOf' | 'oneOf';
const COMBINATORS: readonly Combinator[] = ['allOf', 'anyOf', 'oneOf'];

const hasRootCombinator = (schema: Readonly<Record<string, unknown>>): boolean =>
  COMBINATORS.some((keyword) => keyword in schema);

/** A group of parameters named together: one branch of an `anyOf` or a `oneOf`. */
interface Group {
  readonly keyword: 'anyOf' | 'oneOf';
  readonly required: readonly string[];
}

interface Flat {
  readonly properties: Record<string, unknown>;
  readonly required: string[];
  readonly groups: Group[];
}

/** A property two branches define differently keeps both, nested where the API accepts a combinator. */
function mergedProperty(existing: unknown, incoming: unknown): unknown {
  if (JSON.stringify(existing) === JSON.stringify(incoming)) return existing;
  const options = isRecord(existing) && Array.isArray(existing.anyOf) ? existing.anyOf : [existing];
  const seen = options.some((each) => JSON.stringify(each) === JSON.stringify(incoming));
  return { anyOf: seen ? options : [...options, incoming] };
}

function mergeProperties(into: Record<string, unknown>, from: Record<string, unknown>): void {
  for (const [name, definition] of Object.entries(from)) {
    into[name] = Object.hasOwn(into, name) ? mergedProperty(into[name], definition) : definition;
  }
}

const requiredOf = (schema: Record<string, unknown>): string[] =>
  Array.isArray(schema.required)
    ? schema.required.filter((name): name is string => typeof name === 'string')
    : [];

/** A branch with no `type` is read as an object schema, as one that says `object` is. */
const OBJECT_TYPES: ReadonlySet<unknown> = new Set([undefined, 'object']);

/** The branch as an object schema, or why it cannot be folded into one. */
function objectBranch(branch: unknown): Record<string, unknown> | string {
  if (!isRecord(branch)) return 'a branch is not a schema object';
  if (!OBJECT_TYPES.has(branch.type)) return 'a branch is not an object schema';
  return '$ref' in branch ? 'a branch is a $ref, which cannot be merged' : branch;
}

type Merge = (into: Flat, branch: Flat, keyword: Combinator) => void;

/** One strategy per combinator (K1): what a branch contributes to the flattened schema. */
const MERGES: { readonly [K in Combinator]: Merge } = {
  allOf: (into, branch) => {
    mergeProperties(into.properties, branch.properties);
    into.required.push(...branch.required);
    into.groups.push(...branch.groups);
  },
  anyOf: (into, branch) => {
    mergeProperties(into.properties, branch.properties);
    into.groups.push({ keyword: 'anyOf', required: branch.required }, ...branch.groups);
  },
  oneOf: (into, branch) => {
    mergeProperties(into.properties, branch.properties);
    into.groups.push({ keyword: 'oneOf', required: branch.required }, ...branch.groups);
  },
};

function flatten(schema: Record<string, unknown>): Flat | string {
  const flat: Flat = {
    properties: isRecord(schema.properties) ? { ...schema.properties } : {},
    required: requiredOf(schema),
    groups: [],
  };
  for (const keyword of COMBINATORS) {
    if (!(keyword in schema)) continue;
    const branches = schema[keyword];
    if (!Array.isArray(branches) || branches.length === 0) {
      return `${keyword} is not a non-empty list of schemas`;
    }
    for (const branch of branches) {
      const object = objectBranch(branch);
      if (typeof object === 'string') return object;
      const inner = flatten(object);
      if (typeof inner === 'string') return inner;
      MERGES[keyword](flat, inner, keyword);
    }
  }
  return flat;
}

const GROUP_INTRO: { readonly [K in Group['keyword']]: string } = {
  anyOf: 'Provide the parameters of at least one of these groups:',
  oneOf: 'Provide the parameters of exactly one of these groups:',
};

/**
 * The sentence prepended to the description (judgment, spec/judgments.md: the docs say it "tells Claude
 * which parameter groups belong together", not what it says). A group with no required parameter
 * names nothing, so with none left there is no sentence.
 */
function groupSentence(groups: readonly Group[]): string | undefined {
  const sentences = (['anyOf', 'oneOf'] as const).flatMap((keyword) => {
    const named = groups.filter((group) => group.keyword === keyword && group.required.length > 0);
    return named.length === 0
      ? []
      : [
          `${GROUP_INTRO[keyword]} ${named.map((group) => `(${group.required.join(', ')})`).join(' or ')}.`,
        ];
  });
  return sentences.length === 0 ? undefined : sentences.join(' ');
}

const withoutCombinators = (schema: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(schema).filter(([key]) => !COMBINATORS.some((keyword) => keyword === key)),
  );

function rewritten(tool: McpToolDeclaration): McpToolDeclaration | string {
  const flat = flatten({ ...tool.inputSchema });
  if (typeof flat === 'string') return flat;
  const required = [...new Set(flat.required)];
  const sentence = groupSentence(flat.groups);
  const description = [sentence, tool.description].filter((part) => part !== undefined).join(' ');
  return {
    name: tool.name,
    ...(description === '' ? {} : { description }),
    inputSchema: {
      ...withoutCombinators({ ...tool.inputSchema }),
      type: 'object',
      properties: flat.properties,
      ...(required.length === 0 ? {} : { required }),
    },
  };
}

/** The problems the API would refuse the schema for: property names always, the meta-schema for its dialects. */
function schemaProblems(schema: unknown): string[] {
  return [
    ...propertyNameProblems(schema),
    ...(checksMetaSchema(schema) ? metaSchemaProblems(schema) : []),
  ];
}

const WOULD_BE_REJECTED = 'input schema would be rejected by the Anthropic API';

const excluded = (name: string, reasons: readonly string[]): McpToolPreparation => ({
  sent: false,
  reasons,
  log: reasons.map((reason) => `Tool "${name}" skipped: ${reason}`),
});

/**
 * The tool as it goes to the API, or why it does not. Judgments (spec/judgments.md): a branch that is
 * not an object schema, a `$ref` branch or an empty combinator cannot be flattened and skips the tool;
 * properties two branches define differently are kept nested in an `anyOf`; the wording of the log
 * lines other than the phrases the docs quote.
 */
export function prepareMcpTool(listed: McpListedTool, policy: McpToolPolicy): McpToolPreparation {
  const { inputSchema } = listed;
  if (!isRecord(inputSchema)) return excluded(listed.name, ['the input schema is not an object']);
  const tool: McpToolDeclaration = { ...listed, inputSchema };
  let prepared = tool;
  if (hasRootCombinator(inputSchema)) {
    if (!policy.rewriteRootCombinators) {
      return excluded(tool.name, [
        'the input schema has a root-level combinator and the rewrite is not enabled',
      ]);
    }
    const flat = rewritten(tool);
    if (typeof flat === 'string')
      return excluded(tool.name, [`the root-level combinator cannot be flattened: ${flat}`]);
    prepared = flat;
  }
  const problems = schemaProblems(prepared.inputSchema);
  if (problems.length === 0) return { sent: true, tool: prepared, log: [] };
  if (policy.excludeInvalid) return excluded(tool.name, problems);
  return { sent: true, tool: prepared, log: [`Tool "${tool.name}": ${WOULD_BE_REJECTED}`] };
}

/**
 * What Claude is told about the tools Claude Code excluded: "tells Claude which tools it excluded and
 * why, so you can ask Claude why a tool is missing". The wording is the kit's. `undefined` for none.
 */
export function excludedToolsNotice(
  tools: readonly { readonly name: string; readonly reasons: readonly string[] }[],
): string | undefined {
  if (tools.length === 0) return undefined;
  const lines = tools.map((tool) => `- ${tool.name}: ${tool.reasons.join('; ')}`);
  return `These MCP tools were excluded because the API would refuse their input schema:\n${lines.join('\n')}`;
}

/**
 * The tool the API refused, resent "with the tool declared without parameters", and the line for the
 * server's log: "the API refused this tool's input schema ... The log line ends with `The API said:`
 * and the API's reason".
 */
export function refusedSchemaFallback(
  tool: McpToolDeclaration,
  apiReason: string,
): { readonly tool: McpToolDeclaration; readonly log: string } {
  return {
    tool: {
      name: tool.name,
      ...(tool.description === undefined ? {} : { description: tool.description }),
      inputSchema: { type: 'object', properties: {} },
    },
    log: `Tool "${tool.name}": the API refused this tool's input schema and the tool is sent without parameters. The API said: ${apiReason}`,
  };
}
