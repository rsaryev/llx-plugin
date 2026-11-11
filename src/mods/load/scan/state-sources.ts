import type { CallExpression, Node } from 'acorn';
import { isArray, isCall, isIdentifier } from './ast.ts';
import type { Atom, TopLevel } from './top-level.ts';

/**
 * The values a `read($, source)` or `update($, source, fn)` of `claude-code` reaches: an atom held in
 * a top-level const, a `derive` of such sources (its sources' values), or `memberOf(atom, e)` (the
 * atom's; claude-code/index.d.ts:6407). `claude plugin validate` 2.1.321 lists those values on
 * `state reads:`, and `update`'s on both lines (oracle 2.1.321, spec/judgments.md). `undefined` when
 * the scan cannot read the source; `update` of a derived value is refused as `$.state` refuses it.
 */
function stateSource(
  top: TopLevel,
  node: Node | undefined,
  isWrite: boolean,
): readonly Atom[] | undefined {
  if (isIdentifier(node)) {
    const atom = top.atoms.get(node.name);
    if (atom) return [atom];
    return isWrite ? undefined : top.derived.get(node.name);
  }
  if (!isCall(node) || !isIdentifier(node.callee)) return undefined;
  if (top.imported.get(node.callee.name) !== 'memberOf') return undefined;
  const [family] = node.arguments;
  const atom = isIdentifier(family) ? top.atoms.get(family.name) : undefined;
  return atom ? [atom] : undefined;
}

/** The values a top-level `derive([a, b], fn)` reads, or `undefined` when one source is unreadable. */
export function derivedSources(top: TopLevel, call: CallExpression): readonly Atom[] | undefined {
  const [sources] = call.arguments;
  if (!isArray(sources)) return undefined;
  const atoms: Atom[] = [];
  for (const element of sources.elements) {
    const found = element === null ? undefined : stateSource(top, element, false);
    if (!found) return undefined;
    atoms.push(...found);
  }
  return atoms;
}

export type StateFunction = 'read' | 'update';

/**
 * What one `read($, source)` or `update($, source, fn)` adds to the scan: the `$.state` calls it
 * makes (`state.get`, and `state.set` for `update`), the values it reads and those `update`
 * writes; or the name of a source the scan cannot read.
 */
export function stateUse(
  top: TopLevel,
  imported: StateFunction,
  call: CallExpression,
):
  | {
      readonly calls: readonly string[];
      readonly reads: readonly string[];
      readonly writes: readonly string[];
    }
  | { readonly unreadable: string } {
  const source = call.arguments[1];
  const isWrite = imported === 'update';
  const atoms = stateSource(top, source, isWrite);
  if (!atoms) return { unreadable: isIdentifier(source) ? source.name : 'the value' };
  const values = atoms.map((atom) => `${atom.plugin}.${atom.key}`);
  return {
    calls: isWrite ? ['state.get', 'state.set'] : ['state.get'],
    reads: values,
    writes: isWrite ? values : [],
  };
}
