import { z } from 'zod';
import { isRecord } from '../../protocol/is-record.ts';

/**
 * What the kit knows about one event (plugins/mods/reference.md, "Events"): the fields the docs
 * name on its input, the shapes a hook can answer with (the "A hook can return" column), and the
 * rules that go with them. The docs name no other field of an event, so every input is a loose
 * object: a field the docs do not name is carried, never refused or typed (judgment).
 */
export interface EventSpec {
  /** The documented fields of the event's input. */
  readonly input: z.ZodType;
  /** What a hook's result must look like; one that does not fit makes the hook fail like a throw. */
  readonly result: z.ZodType;
  /** Why a result is refused when the hook had already called `next`, though its shape fits. */
  readonly answeredProblem?: (result: unknown) => string | undefined;
  /** Why the event a hook passes to `next` is refused, comparing it with the one the hook received. */
  readonly changeProblem?: (original: unknown, changed: unknown) => string | undefined;
  /** What Claude Code's own behaviour receives, from the event as fired and the one the hooks passed on. */
  readonly coreInput?: (original: unknown, passed: unknown) => unknown;
  /** A hook's result as it counts, for example with an over-long reason cut. */
  readonly settle?: (result: unknown) => unknown;
}

export const text = z.string();
export const flag = z.boolean();
export const count = z.number();

/** An event's input with the fields the docs name. */
export const fields = <T extends z.ZodRawShape>(shape: T) => z.looseObject(shape);

/** An answer with the documented keys; a key the docs do not name is carried. */
export const answer = <T extends z.ZodRawShape>(shape: T) => z.looseObject(shape);

/** An event whose only documented answer is `next(e)`: the docs give no result shape, so none is checked. */
export const passThrough = z.unknown();

/** An event whose input has no field the docs name. */
export const noFields = z.looseObject({});

type Pair = readonly [unknown, unknown];

/** The pairs of children two containers hold, or `undefined` when their shapes differ. */
function childPairs(a: unknown, b: unknown): readonly Pair[] | undefined {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length ? a.map((item, index): Pair => [item, b[index]]) : undefined;
  }
  if (!isRecord(a) || !isRecord(b)) return undefined;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].map((key): Pair => [a[key], b[key]]);
}

/** Whether `a` and `b` were compared already: a pair met again, through a cycle or a shared object, is not walked twice. */
function seenBefore(seen: WeakMap<object, WeakSet<object>>, a: unknown, b: unknown): boolean {
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  const partners = seen.get(a) ?? new WeakSet<object>();
  seen.set(a, partners);
  if (partners.has(b)) return true;
  partners.add(b);
  return false;
}

/** Whether two plain values hold the same data. The walk does not recurse, so data of any depth is compared. */
export function sameData(a: unknown, b: unknown): boolean {
  const pending: Pair[] = [[a, b]];
  const seen = new WeakMap<object, WeakSet<object>>();
  for (let pair = pending.pop(); pair; pair = pending.pop()) {
    const [left, right] = pair;
    if (Object.is(left, right) || seenBefore(seen, left, right)) continue;
    const children = childPairs(left, right);
    if (children === undefined) return false;
    for (const child of children) pending.push(child);
  }
  return true;
}
