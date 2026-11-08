import type { Node, ObjectExpression } from 'acorn';
import { isArray, isIdentifier, isLiteral, isProperty, stringOf } from './ast.ts';

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
export function matcherLabel(matcher: ObjectExpression): string {
  return matcher.properties
    .map((property) => {
      if (!isProperty(property)) return '?';
      const key = isIdentifier(property.key) ? property.key.name : (stringOf(property.key) ?? '?');
      return `${key}=${valueLabel(property.value)}`;
    })
    .join(',');
}
