import type { Alternative, Shape } from '../../scripts/spec/declarations/snapshot.ts';

/**
 * Whether a value fits a declared shape (`spec/mods-declarations.json`, `Shape`), as the problems
 * that keep it from fitting: none when it fits. A field the kit gives that an object of the
 * declarations does not name is one, unless the object takes any key.
 */

const kindOfValue = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};

type Check = (value: unknown, alternative: Alternative, at: string) => string[];

const typed =
  (kind: string): Check =>
  (value, _alternative, at) =>
    kindOfValue(value) === kind ? [] : [`${at} is ${kindOfValue(value)}, declared ${kind}`];

function objectProblems(value: unknown, alternative: Alternative, at: string): string[] {
  if (typeof value !== 'object' || value === null) {
    return [`${at} is ${kindOfValue(value)}, declared an object`];
  }
  if (!('fields' in alternative) || !alternative.fields) return [];
  const fields = alternative.fields;
  const given: Readonly<Record<string, unknown>> = Object(value);
  const problems = fields.flatMap((field) => {
    const named = `${at}.${field.name}`;
    if (given[field.name] === undefined) {
      const takesUndefined = field.shape.some(
        (one) => one.kind === 'any' || one.kind === 'undefined',
      );
      return field.optional || takesUndefined ? [] : [`${named} is missing, declared required`];
    }
    return shapeProblems(given[field.name], field.shape, named);
  });
  const extra = alternative.open
    ? []
    : Object.keys(given)
        .filter((name) => given[name] !== undefined && !fields.some((one) => one.name === name))
        .map((name) => `${at}.${name} is given by the kit, not declared`);
  return [...problems, ...extra];
}

const CHECKS: Readonly<Record<Alternative['kind'], Check>> = {
  any: () => [],
  never: (_value, _alternative, at) => [`${at} is given, declared never`],
  undefined: typed('undefined'),
  null: typed('null'),
  boolean: typed('boolean'),
  string: typed('string'),
  number: typed('number'),
  bigint: typed('bigint'),
  function: typed('function'),
  literal: (value, alternative, at) =>
    'value' in alternative && value === alternative.value
      ? []
      : [
          `${at} is ${JSON.stringify(value)}, declared ${JSON.stringify(Reflect.get(alternative, 'value'))}`,
        ],
  array(value, alternative, at) {
    if (!Array.isArray(value)) return [`${at} is ${kindOfValue(value)}, declared an array`];
    const of = 'of' in alternative ? alternative.of : [];
    return value.flatMap((item: unknown, index) => shapeProblems(item, of, `${at}[${index}]`));
  },
  object: objectProblems,
};

/** The kind of value an alternative holds: a literal's is its value's. */
const valueKindOf = (alternative: Alternative): string =>
  'value' in alternative ? typeof alternative.value : alternative.kind;

/**
 * The problems of the alternative of the value's own kind it comes nearest to fitting, or none when
 * one fits; when no alternative is of its kind, the one line that says so.
 */
export function shapeProblems(value: unknown, shape: Shape, at: string): string[] {
  const kind = kindOfValue(value);
  let best: string[] | undefined;
  for (const alternative of shape) {
    const problems = CHECKS[alternative.kind](value, alternative, at);
    if (problems.length === 0) return [];
    const same = valueKindOf(alternative) === (kind === 'array' ? 'array' : kind);
    if (same && (!best || problems.length < best.length)) best = problems;
  }
  if (best) return best;
  const declared = [...new Set(shape.map(valueKindOf))].join(' | ');
  return shape.length === 0 ? [] : [`${at} is ${kind}, declared ${declared}`];
}

/** How a declared parameter list reads: `(server, tool, args?)`. */
export const signatureText = (
  params: readonly { readonly name: string; readonly optional: boolean }[],
): string => `(${params.map((one) => `${one.name}${one.optional ? '?' : ''}`).join(', ')})`;
