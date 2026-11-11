import {
  ELEMENT_COLUMN_OF,
  TEXT_SIZES,
  TEXT_WEIGHTS,
  TEXT_WRAPS,
  type ElementColumn,
  type UiSurface,
} from '../../../protocol/mods-ui-names.ts';
import { firstProblem, oneOf, type ElementDef } from './def.ts';

/** What `Text`'s `dir` takes (claude-code/index.d.ts:13935). */
const TEXT_DIRECTIONS = ['ltr', 'rtl'] as const;
import type { ElementNode, Props } from './node.ts';

export const TEXT: ElementDef = {
  name: 'Text',
  props: [
    'color',
    'backgroundColor',
    'bold',
    'italic',
    'underline',
    'strikethrough',
    'dimColor',
    'inverse',
    'wrap',
    'size',
    'weight',
    'mono',
    'tabular',
    'hover',
    // The direction the text reads in (claude-code/index.d.ts:13935).
    'dir',
  ],
  children: 'text',
  check: (props) =>
    firstProblem(
      oneOf('Text', props, 'wrap', TEXT_WRAPS),
      oneOf('Text', props, 'size', TEXT_SIZES),
      oneOf('Text', props, 'weight', TEXT_WEIGHTS),
      oneOf('Text', props, 'dir', TEXT_DIRECTIONS),
    ),
};

/** The typography props an app ignores: "the text as if you'd left that prop out" (reference.md, "`Text` typography props"). */
const TYPOGRAPHY_IGNORED: { readonly [C in ElementColumn]: readonly string[] } = {
  terminal: ['size', 'mono', 'tabular'],
  desktop: [],
  vscode: ['size', 'mono', 'tabular'],
};

/** Weights that draw as bold text in the terminal and the VS Code extension. */
const BOLD_WEIGHTS: ReadonlySet<unknown> = new Set(['semibold', 'bold']);

/** Whether `node` is a `Text`. */
export const isText = (node: ElementNode): boolean => node.type === TEXT.name;

export interface TextStyle {
  /** Whether the text draws bold: `weight` when it is set, else `bold` ("If you set both, `bold` has no effect"). */
  readonly isBold: boolean;
  /** The typography props the app ignores. */
  readonly ignored: readonly string[];
}

/**
 * How an app draws a `Text`'s weight and typography. Judgment: the Desktop app's weights are its
 * own to draw, so its `isBold` follows the same rule and it ignores nothing the docs name.
 */
export function textStyle(surface: UiSurface, props: Props): TextStyle {
  const isBold = props.weight === undefined ? props.bold === true : BOLD_WEIGHTS.has(props.weight);
  return {
    isBold,
    ignored: TYPOGRAPHY_IGNORED[ELEMENT_COLUMN_OF[surface]].filter(
      (prop) => props[prop] !== undefined,
    ),
  };
}
