/** A JSON value: what crosses between the kit and a mod's code. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

/** What a walk of a value found. `depth` counts nested arrays and objects: a scalar is 0, `[1]` is 1, `[[1]]` is 2. */
export interface PlainDataStats {
  readonly depth: number;
  /** Arrays, objects and scalars together. */
  readonly nodes: number;
  /** Characters of every string, keys included. */
  readonly chars: number;
}

export interface PlainDataLimits {
  readonly maxDepth?: number;
  readonly maxNodes?: number;
  readonly maxChars?: number;
}

/** Which limit a value went past, first found. */
export type PlainDataProblem = 'depth' | 'nodes' | 'chars';

const isContainer = (value: unknown): value is object =>
  typeof value === 'object' && value !== null;

const childrenOf = (value: object): readonly unknown[] =>
  Array.isArray(value) ? value : Object.values(value);

interface Frame {
  readonly value: unknown;
  /** Arrays and objects strictly above this value. */
  readonly above: number;
}

const limitProblem = (
  stats: PlainDataStats,
  limits: PlainDataLimits,
): PlainDataProblem | undefined => {
  if (limits.maxDepth !== undefined && stats.depth > limits.maxDepth) return 'depth';
  if (limits.maxNodes !== undefined && stats.nodes > limits.maxNodes) return 'nodes';
  if (limits.maxChars !== undefined && stats.chars > limits.maxChars) return 'chars';
  return undefined;
};

/**
 * Walks `value` without recursion, so a structure tens of thousands of levels deep never
 * overflows the stack, and stops at the first limit it goes past. A container reached twice is
 * counted once, so a cycle ends the walk instead of looping. Returns the problem, or the stats of
 * the whole value.
 */
export function walkPlainData(
  value: unknown,
  limits: PlainDataLimits = {},
): { readonly problem: PlainDataProblem } | { readonly stats: PlainDataStats } {
  const seen = new WeakSet<object>();
  const stack: Frame[] = [{ value, above: 0 }];
  let stats: PlainDataStats = { depth: 0, nodes: 0, chars: 0 };
  for (let frame = stack.pop(); frame; frame = stack.pop()) {
    const chars = typeof frame.value === 'string' ? frame.value.length : 0;
    const own = frame.above + (isContainer(frame.value) ? 1 : 0);
    stats = {
      depth: Math.max(stats.depth, own),
      nodes: stats.nodes + 1,
      chars: stats.chars + chars,
    };
    const problem = limitProblem(stats, limits);
    if (problem) return { problem };
    if (!isContainer(frame.value) || seen.has(frame.value)) continue;
    seen.add(frame.value);
    const keys = Array.isArray(frame.value) ? [] : Object.keys(frame.value);
    stats = { ...stats, chars: stats.chars + keys.reduce((sum, key) => sum + key.length, 0) };
    for (const child of childrenOf(frame.value)) stack.push({ value: child, above: own });
  }
  return { stats };
}

/** The first limit `value` goes past, or `undefined` when it fits. */
export function plainDataProblem(
  value: unknown,
  limits: PlainDataLimits,
): PlainDataProblem | undefined {
  const walked = walkPlainData(value, limits);
  return 'problem' in walked ? walked.problem : undefined;
}
