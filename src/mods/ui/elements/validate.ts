import {
  ELEMENT_COLUMN_OF,
  ELEMENT_SURFACES,
  type ElementName,
  type RenderSite,
  type UiSurface,
} from '../../../protocol/mods-ui-names.ts';
import { buttonKey, isButton } from './button.ts';
import { childProblem } from './children.ts';
import { isElementNode, isEngineRef, isTree, walkTree, type ElementNode } from './node.ts';
import { ELEMENT_DEFS } from './registry.ts';

/** Elements whose `key` addresses them and must be given: "Give every `Input` and `Select` a `key` prop". */
const NEEDS_KEY: ReadonlySet<ElementName> = new Set(['Input', 'Select']);

/** Why one element is not valid for `surface`, or `undefined`: its type, its props, its children. */
function nodeProblem(node: ElementNode, surface: UiSurface): string | undefined {
  const def = ELEMENT_DEFS[node.type];
  if (!ELEMENT_SURFACES[node.type].includes(ELEMENT_COLUMN_OF[surface])) {
    return `${node.type} is not drawn by the ${surface} app`;
  }
  const stray = Object.keys(node.props).find((prop) => !def.props.includes(prop));
  if (stray !== undefined) return `${node.type} prop "${stray}" is not allowed`;
  for (const child of node.children) {
    const found = childProblem(node.type, def.children, child);
    if (found !== undefined) return found;
  }
  return def.check?.(node.props);
}

/** The key problem of a control, or `undefined`: `<Input> needs a key`, `<Button> needs a key`. */
function keyProblem(node: ElementNode): string | undefined {
  const button = isButton(node);
  if (!button && !NEEDS_KEY.has(node.type)) return undefined;
  const key = button ? buttonKey(node) : node.props.key;
  return typeof key === 'string' && key !== '' ? undefined : `<${node.type}> needs a key`;
}

/**
 * Why `tree` is not a valid drawing of `site` for `surface`, or `undefined` (troubleshoot.md, "A
 * pane or band is empty": `a tree Pane refuses: Text prop "bogusProp" is not allowed`). The first
 * problem in document order. Size limits are not checked here: they refuse the tree at its site.
 */
export function treeProblem(
  site: RenderSite,
  surface: UiSurface,
  tree: unknown,
): string | undefined {
  const refuses = (why: string): string => `a tree ${site} refuses: ${why}`;
  if (!isTree(tree)) return refuses('it is not an element tree');
  const drawnTwice = new Set<string>();
  for (const { node } of walkTree(tree)) {
    if (!isElementNode(node)) continue;
    const found = nodeProblem(node, surface) ?? keyProblem(node);
    if (found !== undefined) return refuses(found);
    const key = node.props.key;
    if (!NEEDS_KEY.has(node.type) || typeof key !== 'string') continue;
    const id = `${node.type} "${key}"`;
    if (drawnTwice.has(id)) return refuses(`${id} is drawn twice; each takes its own key`);
    drawnTwice.add(id);
  }
  return undefined;
}

/** How many times Claude Code's own drawing sits in `tree`. */
export const engineRefs = (tree: unknown): number =>
  [...walkTree(tree)].filter(({ node }) => isEngineRef(node)).length;
