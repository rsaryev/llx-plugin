import { MOD_LIMITS } from '../../../protocol/mods-limits.ts';
import { imageBytes, isImage } from './image.ts';
import { isElementNode, walkTree, type ElementNode, type TreeChild } from './node.ts';
import { isRaster, rasterCells } from './raster.ts';
import { childrenFrom } from './children.ts';

/** What one tree holds, measured against the Limits table. */
export interface TreeSize {
  /** Levels below the root element. */
  readonly depth: number;
  /** Elements and text children. */
  readonly nodes: number;
  readonly rasterCells: number;
  readonly imageBytes: number;
}

export function measureTree(tree: unknown): TreeSize {
  let depth = 0;
  let nodes = 0;
  let cells = 0;
  let bytes = 0;
  for (const visit of walkTree(tree, Infinity)) {
    nodes += 1;
    depth = Math.max(depth, visit.depth);
    if (!isElementNode(visit.node)) continue;
    if (isRaster(visit.node)) cells += rasterCells(visit.node.props);
    if (isImage(visit.node)) bytes += imageBytes(visit.node.props);
    if (nodes > MOD_LIMITS.treeNodes) break; // enough to refuse; a cycle ends here
  }
  return { depth, nodes, rasterCells: cells, imageBytes: bytes };
}

/**
 * Why a tree is "not drawn" (reference.md, "Limits": nesting, element, `Raster` cell and `Image`
 * byte limits), or `undefined`. `deeper than 32; nothing was drawn` is the documented text
 * (troubleshoot.md, "A `ui.render` line says `refused`"); the others follow it (judgment).
 */
export function sizeProblem(tree: unknown): string | undefined {
  const size = measureTree(tree);
  if (size.depth > MOD_LIMITS.treeDepth) {
    return `deeper than ${MOD_LIMITS.treeDepth}; nothing was drawn`;
  }
  if (size.nodes > MOD_LIMITS.treeNodes) {
    return `more than ${MOD_LIMITS.treeNodes} elements and text children; nothing was drawn`;
  }
  if (size.rasterCells > MOD_LIMITS.rasterCells) {
    return `Raster cells over ${MOD_LIMITS.rasterCells}; nothing was drawn`;
  }
  return size.imageBytes > MOD_LIMITS.imageBytes
    ? `Image bytes over ${MOD_LIMITS.imageBytes}; nothing was drawn`
    : undefined;
}

interface Budget {
  left: number;
}

function clipChild(child: TreeChild, budget: Budget): TreeChild {
  if (typeof child === 'string') {
    const kept = child.slice(0, budget.left);
    budget.left -= kept.length;
    return kept;
  }
  return isElementNode(child) ? clipNode(child, budget) : child;
}

function clipNode(node: ElementNode, budget: Budget): ElementNode {
  return {
    ...node,
    children: childrenFrom(node.children).map((child) => clipChild(child, budget)),
  };
}

/**
 * The tree with the first 100,000 characters of text drawn and the rest cut: "The first 100,000
 * characters are drawn", not an error. Judgment: the text of a tree is its string children.
 */
export function clipText(tree: ElementNode): ElementNode {
  return clipNode(tree, { left: MOD_LIMITS.treeText });
}
