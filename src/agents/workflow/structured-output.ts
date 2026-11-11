import { error, type PluginIssue } from '../../format/issues.ts';
import { isRecord } from '../../protocol/is-record.ts';

/**
 * The `schema` option of an `agent()` call (workflows.md, "What the saved script looks like"): Claude
 * Code "checks the schema before starting the subagent: when it can prove the schema contradicts
 * itself, the call fails with an error naming the contradiction", and "if the subagent's output still
 * fails validation after five attempts, the call fails with an error that includes the last validation
 * failure"; `MAX_STRUCTURED_OUTPUT_RETRIES` changes the attempt count (env-vars.md). Pure decisions: the
 * kit validates no output and starts no agent.
 */

/** A pattern of `patternProperties` that matches `key`; one that is not a pattern matches nothing we can prove. */
function patternMatches(pattern: string, key: string): boolean | undefined {
  try {
    return new RegExp(pattern, 'u').test(key);
  } catch {
    return undefined;
  }
}

/** Whether `additionalProperties: false` rules `key` out: no `properties` entry, and no pattern that may match. */
function ruledOut(node: Record<string, unknown>, key: string): boolean {
  const named = isRecord(node.properties) && Object.hasOwn(node.properties, key);
  if (named) return false;
  const patterns = isRecord(node.patternProperties) ? Object.keys(node.patternProperties) : [];
  return patterns.every((pattern) => patternMatches(pattern, key) === false);
}

const OBJECT_TYPE = 'object';

/** The schema describes an object: `type` is `object` (or a list of just that). */
const isObjectType = (node: Record<string, unknown>): boolean =>
  node.type !== undefined && [node.type].flat().every((each) => each === OBJECT_TYPE);

/** A `required` key that `additionalProperties: false` rules out, in a schema that is an object (judgment: `type: 'object'`). */
function contradictions(node: Record<string, unknown>, path: string): PluginIssue[] {
  const required = Array.isArray(node.required) ? node.required : [];
  if (node.additionalProperties !== false || !isObjectType(node)) return [];
  return required
    .filter((key): key is string => typeof key === 'string' && ruledOut(node, key))
    .map((key) =>
      error(
        path,
        `schema contradicts itself: "${key}" is required, but additionalProperties is false and "${key}" is not a property`,
      ),
    );
}

/** The sub-schemas a contradiction is looked for in: each property and the items of an array. */
function children(node: Record<string, unknown>, path: string): [string, unknown][] {
  const properties = isRecord(node.properties) ? Object.entries(node.properties) : [];
  const items = isRecord(node.items) ? [[`${path}.items`, node.items] as [string, unknown]] : [];
  return [
    ...properties.map(([key, value]): [string, unknown] => [`${path}.properties.${key}`, value]),
    ...items,
  ];
}

function walk(node: unknown, path: string): PluginIssue[] {
  if (!isRecord(node)) return [];
  return [
    ...contradictions(node, path),
    ...children(node, path).flatMap(([at, child]) => walk(child, at)),
  ];
}

/**
 * The contradictions the kit can prove in a `schema` before the subagent starts, each an error that
 * names the key; none means the call goes on. Only the documented one is proven: a `required` key that
 * `additionalProperties: false` rules out, at the top or in a nested property or items schema.
 */
export function checkAgentSchema(schema: unknown): readonly PluginIssue[] {
  return walk(schema, 'schema');
}

/** "Defaults to 5, a first attempt plus four retries". */
const DEFAULT_STRUCTURED_OUTPUT_ATTEMPTS = 5;
const STRUCTURED_OUTPUT_ENV = 'MAX_STRUCTURED_OUTPUT_RETRIES';

/**
 * How many attempts a subagent's structured output gets: `MAX_STRUCTURED_OUTPUT_RETRIES` or 5. A value
 * that is not a positive whole number is no value (judgment, as for the stall window).
 */
export function structuredOutputAttempts(
  env: Readonly<Record<string, string | undefined>>,
): number {
  const text = env[STRUCTURED_OUTPUT_ENV];
  const value = text !== undefined && /^\d+$/.test(text) ? Number(text) : 0;
  return value > 0 ? value : DEFAULT_STRUCTURED_OUTPUT_ATTEMPTS;
}

export type AfterInvalidOutput =
  | { readonly retry: true }
  | { readonly retry: false; readonly issue: PluginIssue };

/**
 * What follows an attempt whose output failed validation: `failures` holds the validation failure of
 * every attempt so far, the last one being the attempt that just ended. The call goes on until the
 * attempts are used up, then fails with an error that includes the last failure (judgment: the wording
 * of the rest).
 */
export function afterInvalidOutput(
  failures: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): AfterInvalidOutput {
  const attempts = structuredOutputAttempts(env);
  if (failures.length < attempts) return { retry: true };
  const last = failures.at(-1) ?? 'no output';
  const message = `agent output failed validation on all ${attempts} attempts; last failure: ${last}`;
  return { retry: false, issue: error('agent', message) };
}
