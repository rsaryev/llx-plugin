import { ELEMENT_NAMES, type ElementName } from '../../../protocol/mods-ui-names.ts';
import { MOD_LIMITS } from '../../../protocol/mods-limits.ts';

/** The props of an element, as plain data and callbacks. */
export type Props = Readonly<Record<string, unknown>>;

/** What an element function gives back: `{ type, props, children }`, the shape `find` of the test kit returns (test.md, "Test a drawing"). */
export interface ElementNode {
  readonly type: ElementName;
  readonly props: Props;
  readonly children: readonly TreeChild[];
}

/**
 * Claude Code's own drawing of a site, which `next(e)` resolves to unless a mod after the hook
 * returned a tree (interface.md, "Change what Claude Code already draws"). Judgment: the docs name
 * `ref` and no more, so it is opaque.
 */
export const ENGINE_TYPE = 'engine';
export interface EngineRef {
  readonly type: typeof ENGINE_TYPE;
  readonly ref: unknown;
}

export type TreeChild = string | ElementNode | EngineRef;

const ELEMENTS: ReadonlySet<string> = new Set(ELEMENT_NAMES);

export const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isEngineRef = (value: unknown): value is EngineRef =>
  isRecord(value) && value.type === ENGINE_TYPE && 'ref' in value;

export const isElementName = (value: unknown): value is ElementName =>
  typeof value === 'string' && ELEMENTS.has(value);

/** An element: a known `type`, `props` that are a record and `children` that are a list. */
export const isElementNode = (value: unknown): value is ElementNode =>
  isRecord(value) &&
  isElementName(value.type) &&
  isRecord(value.props) &&
  Array.isArray(value.children);

export const isTree = (value: unknown): value is ElementNode | EngineRef =>
  isElementNode(value) || isEngineRef(value);

export interface Visit {
  readonly node: TreeChild;
  /** Levels below the root element: the root is 0. A text child sits one level below its element. */
  readonly depth: number;
  readonly parent: ElementNode | undefined;
}

interface Frame {
  readonly node: unknown;
  readonly depth: number;
  readonly parent: ElementNode | undefined;
}

/**
 * Walks a tree in document order without recursion, so a tree thousands of levels deep never
 * overflows the stack, and stops after `cap` visits, so a cycle ends. Anything that is not a
 * string, an element or a reference is skipped: the shape check reports it.
 */
export function* walkTree(root: unknown, cap: number = MOD_LIMITS.treeNodes + 1): Generator<Visit> {
  const stack: Frame[] = [{ node: root, depth: 0, parent: undefined }];
  for (let visits = 0, frame = stack.pop(); frame; frame = stack.pop()) {
    if (visits >= cap) return;
    const { node, depth, parent } = frame;
    if (typeof node === 'string' || isEngineRef(node)) {
      visits += 1;
      yield { node, depth, parent };
    } else if (isElementNode(node)) {
      visits += 1;
      yield { node, depth, parent };
      for (const child of node.children.toReversed()) {
        stack.push({ node: child, depth: depth + 1, parent: node });
      }
    }
  }
}
