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

/** An array or object to walk into. Bytes nest nothing: a typed array or `DataView` is a leaf. */
const isContainer = (value: unknown): value is object =>
  typeof value === 'object' && value !== null && !ArrayBuffer.isView(value);

const childrenOf = (value: object): readonly unknown[] =>
  Array.isArray(value) ? value : Object.values(value);

interface Frame {
  readonly value: unknown;
  /** Arrays and objects strictly above this value. */
  readonly above: number;
  /** The walk is leaving `value`: it is no longer on the path from the root. */
  readonly leaving?: boolean;
  /** `value` was measured before, now reached deeper: only its depth is new, so nothing is counted twice. */
  readonly again?: boolean;
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

interface Walk {
  stats: PlainDataStats;
  readonly stack: Frame[];
  /** The deepest level each container was reached at so far. */
  readonly deepest: Map<object, number>;
  /** The containers between the root and the one being walked: reaching one of them again is a cycle. */
  readonly path: Set<object>;
}

const keyChars = (container: object): number =>
  Array.isArray(container) ? 0 : Object.keys(container).reduce((sum, key) => sum + key.length, 0);

/** What a frame adds to the stats: its depth always, its node and characters only the first time `value` is reached. */
function counted(stats: PlainDataStats, frame: Frame, own: number): PlainDataStats {
  const repeat = frame.again === true;
  return {
    depth: Math.max(stats.depth, own),
    nodes: stats.nodes + (repeat ? 0 : 1),
    chars: stats.chars + (repeat || typeof frame.value !== 'string' ? 0 : frame.value.length),
  };
}

/** Walks into a container reached at level `own`, unless it was reached as deep or deeper before. */
function enter(walk: Walk, container: object, own: number): void {
  const before = walk.deepest.get(container);
  if (before !== undefined && before >= own) return;
  walk.deepest.set(container, own);
  walk.path.add(container);
  walk.stack.push({ value: container, above: own, leaving: true });
  const first = before === undefined;
  if (first) walk.stats = { ...walk.stats, chars: walk.stats.chars + keyChars(container) };
  for (const child of childrenOf(container)) {
    walk.stack.push({ value: child, above: own, ...(first ? {} : { again: true }) });
  }
}

/**
 * Walks `value` without recursion, so a structure tens of thousands of levels deep never
 * overflows the stack, and stops at the first limit it goes past. A container reached again is
 * counted once, but walked again when this time it lies deeper than before, so a shared
 * sub-structure is measured at its deepest place; a container that is its own ancestor (a cycle)
 * ends the walk instead of looping. Returns the problem, or the stats of the whole value.
 */
export function walkPlainData(
  value: unknown,
  limits: PlainDataLimits = {},
): { readonly problem: PlainDataProblem } | { readonly stats: PlainDataStats } {
  const walk: Walk = {
    stats: { depth: 0, nodes: 0, chars: 0 },
    stack: [{ value, above: 0 }],
    deepest: new Map(),
    path: new Set(),
  };
  for (let frame = walk.stack.pop(); frame; frame = walk.stack.pop()) {
    if (frame.leaving === true) {
      if (isContainer(frame.value)) walk.path.delete(frame.value);
      continue;
    }
    const own = frame.above + (isContainer(frame.value) ? 1 : 0);
    walk.stats = counted(walk.stats, frame, own);
    const problem = limitProblem(walk.stats, limits);
    if (problem) return { problem };
    if (isContainer(frame.value) && !walk.path.has(frame.value)) enter(walk, frame.value, own);
  }
  return { stats: walk.stats };
}

/** The first limit `value` goes past, or `undefined` when it fits. */
export function plainDataProblem(
  value: unknown,
  limits: PlainDataLimits,
): PlainDataProblem | undefined {
  const walked = walkPlainData(value, limits);
  return 'problem' in walked ? walked.problem : undefined;
}
