import { z } from 'zod';

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

export const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether two plain values hold the same data. */
export function sameData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => sameData(item, b[index]));
  }
  if (!isRecord(a) || !isRecord(b)) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => sameData(a[key], b[key]));
}
