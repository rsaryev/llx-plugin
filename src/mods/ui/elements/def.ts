import type { ElementName } from '../../../protocol/mods-ui-names.ts';
import type { Props, TreeChild } from './node.ts';

/** What an element holds in `children`. */
export const CHILD_RULES = ['none', 'text', 'any', 'label'] as const;
export type ChildRule = (typeof CHILD_RULES)[number];

/** What one element of the elements table needs (reference.md, "Elements"). */
export interface ElementDef {
  readonly name: ElementName;
  /** The props the element takes, `children` not among them. A prop outside the list fails the hook that returned the tree. */
  readonly props: readonly string[];
  readonly children: ChildRule;
  /** Why a prop value is refused, or `undefined`. */
  readonly check?: (props: Props) => string | undefined;
  /** Throws for the values the docs say throw when the element is made. */
  readonly construct?: (props: Props) => void;
}

/** Each rule of what an element may hold, as a test of one child; the registry is typed over the rules. */
export type ChildTest = (child: TreeChild) => boolean;

/** A prop that must be one of `allowed`, or left out: `Box prop "flexDirection" must be one of row, column, row-reverse, column-reverse`. */
export function oneOf(
  element: ElementName,
  props: Props,
  prop: string,
  allowed: readonly string[],
): string | undefined {
  const value = props[prop];
  if (value === undefined || (typeof value === 'string' && allowed.includes(value))) {
    return undefined;
  }
  return `${element} prop "${prop}" must be one of ${allowed.join(', ')}`;
}

/** A prop that is a string of at most `max` characters, or left out. */
export function textOf(
  element: ElementName,
  props: Props,
  prop: string,
  max?: number,
): string | undefined {
  const value = props[prop];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return `${element} prop "${prop}" must be a string`;
  return max !== undefined && value.length > max
    ? `${element} prop "${prop}" is longer than ${max} characters`
    : undefined;
}

/** A prop that is `true` or left out: the controls' `autoFocus` accepts only `true`. */
export function trueOnly(element: ElementName, props: Props, prop: string): string | undefined {
  const value = props[prop];
  return value === undefined || value === true
    ? undefined
    : `${element} prop "${prop}" is true or left out`;
}

/** A prop that is a whole number from 1 to `max`, or left out. */
export function sized(
  element: ElementName,
  props: Props,
  prop: string,
  max: number,
): string | undefined {
  const value = props[prop];
  if (value === undefined) return undefined;
  const fits = typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max;
  return fits ? undefined : `${element} prop "${prop}" must be a whole number from 1 to ${max}`;
}

/** The first problem of several checks. */
export const firstProblem = (...problems: readonly (string | undefined)[]): string | undefined =>
  problems.find((problem) => problem !== undefined);

/** A prop that is a function, or left out. */
export function callback(element: ElementName, props: Props, prop: string): string | undefined {
  const value = props[prop];
  return value === undefined || typeof value === 'function'
    ? undefined
    : `${element} prop "${prop}" must be a function`;
}
