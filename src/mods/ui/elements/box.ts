import {
  BORDER_STYLES,
  FLEX_DIRECTIONS,
  SPACING_STEPS,
  type SpacingStep,
} from '../../../protocol/mods-ui-names.ts';
import { oneOf, type ElementDef } from './def.ts';
import type { ElementNode, Props } from './node.ts';

/** The spacing props: `gap`, `columnGap`, `rowGap`, `padding`, `margin` and the one-side and one-axis forms (reference.md, "`Box` spacing steps"). */
const SIDES = ['Top', 'Bottom', 'Left', 'Right', 'X', 'Y'] as const;
const SPACING_PROPS: readonly string[] = [
  'gap',
  'columnGap',
  'rowGap',
  ...['padding', 'margin'].flatMap((base) => [base, ...SIDES.map((side) => `${base}${side}`)]),
];

/**
 * The layout props the table names as "flex layout" without listing them (judgment,
 * spec/judgments.md: the flexbox props of a terminal box).
 */
const FLEX_PROPS = [
  'flexDirection',
  'flexWrap',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'alignItems',
  'alignSelf',
  'justifyContent',
] as const;

export const isSpacingStep = (value: unknown): value is SpacingStep =>
  typeof value === 'string' && Object.hasOwn(SPACING_STEPS, value);

const STEP_NAMES = Object.keys(SPACING_STEPS);

function spacingProblem(props: Props): string | undefined {
  for (const prop of SPACING_PROPS) {
    const value = props[prop];
    const cells = typeof value === 'number' && Number.isFinite(value) && value >= 0;
    if (value !== undefined && !cells && !isSpacingStep(value)) {
      return `Box prop "${prop}" must be a number of cells or one of ${STEP_NAMES.join(', ')}`;
    }
  }
  return undefined;
}

/**
 * `Box`: a flex container. `borderStyle` is not checked: a name outside the ten "draws with no
 * border" (reference.md, "`Box` border styles"), it does not fail the tree.
 */
export const BOX: ElementDef = {
  name: 'Box',
  props: [
    'key',
    ...FLEX_PROPS,
    ...SPACING_PROPS,
    'width',
    'height',
    'minWidth',
    'minHeight',
    'borderStyle',
    'borderColor',
    'borderDimColor',
    'backgroundColor',
    'position',
    'top',
    'left',
    'right',
    'bottom',
    'overflow',
    'display',
    'hover',
  ],
  children: 'any',
  check: (props) => oneOf('Box', props, 'flexDirection', FLEX_DIRECTIONS) ?? spacingProblem(props),
};

/** Whether `node` is a `Box`. */
export const isBox = (node: ElementNode): boolean => node.type === BOX.name;

/** The border a `Box` draws: its style when the docs name it, else none. */
export const borderOf = (props: Props): (typeof BORDER_STYLES)[number] | undefined =>
  BORDER_STYLES.find((style) => style === props.borderStyle);
