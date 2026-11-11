import type { Node, ObjectExpression } from 'acorn';
import type { ModMatcherValue, ModMatcher } from '../../../protocol/mods-events.ts';
import { isArray, isIdentifier, isLiteral, isObject, isProperty, stringOf } from './ast.ts';

/** One value of a matcher as `validate` prints it: a literal as it is, a regular expression as `/source/flags`, a list as `a|b`, anything else `?`. */
function valueLabel(node: Node | null | undefined): string {
  if (isLiteral(node)) {
    return node.regex ? `/${node.regex.pattern}/${node.regex.flags}` : String(node.value);
  }
  return isArray(node) ? node.elements.map(valueLabel).join('|') : '?';
}

/**
 * The filter of an `on` call in braces, `component=Spinner`: the fields of the object literal in
 * source order, separated by commas (create.md shows `command.run{command=tally}`; judgment: the
 * docs show one field, several are joined by commas).
 */
function matcherLabel(matcher: ObjectExpression): string {
  return matcher.properties
    .map((property) => {
      if (!isProperty(property)) return '?';
      return `${keyOf(property.key)}=${valueLabel(property.value)}`;
    })
    .join(',');
}

const keyOf = (key: Node): string => (isIdentifier(key) ? key.name : (stringOf(key) ?? '?'));

/** A literal value of a matcher as the chain would get it; `undefined` when the source does not spell it out. */
function literalValue(node: Node | null | undefined): ModMatcherValue | undefined {
  if (!isLiteral(node)) return undefined;
  if (node.regex) return { $regexp: node.regex.pattern, flags: node.regex.flags };
  const { value } = node;
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? value
    : undefined;
}

/** One field of a matcher literal: a literal, or a list of literals. */
function valueOf(
  node: Node | null | undefined,
): ModMatcherValue | readonly ModMatcherValue[] | undefined {
  if (!isArray(node)) return literalValue(node);
  const values = node.elements.map(literalValue);
  const known = values.filter((value): value is ModMatcherValue => value !== undefined);
  return known.length === values.length ? known : undefined;
}

/** The fields of a matcher literal the source spells out, as the chain's rules read a matcher. */
function staticMatcher(matcher: ObjectExpression): ModMatcher {
  return Object.fromEntries(
    matcher.properties.flatMap((property) =>
      isProperty(property) ? [[keyOf(property.key), valueOf(property.value)]] : [],
    ),
  );
}

/** The filter an `on` call gives, `on(event, matcher, hook)`: as `validate` prints it, and as the chain would read it. */
export function onFilter(
  second: Node | undefined,
  third: Node | undefined,
): { readonly label?: string; readonly matcher?: ModMatcher } {
  if (third === undefined || !isObject(second)) return {};
  return { label: matcherLabel(second), matcher: staticMatcher(second) };
}
