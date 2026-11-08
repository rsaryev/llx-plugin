import { BUTTON_ROLES, BUTTON_VARIANTS } from '../../../protocol/mods-ui-names.ts';
import { callback, firstProblem, textOf, trueOnly, type ElementDef } from './def.ts';
import type { ElementNode, Props } from './node.ts';

const HOTKEY = /^[0-9a-z]$/;

function hotkeyProblem(props: Props): string | undefined {
  const { hotkey } = props;
  if (hotkey === undefined || (typeof hotkey === 'string' && HOTKEY.test(hotkey))) return undefined;
  return 'Button prop "hotkey" must be one digit or one lowercase letter';
}

/**
 * `Button`: `variant` is `primary` or `secondary`, "and any other value throws"; `role` is
 * `dismiss`, "and any other value throws" (reference.md, "Elements"). The throw is the element
 * function's, so the hook that made the button fails like one that threw. The wording is the kit's.
 */
function construct(props: Props): void {
  const { variant, role } = props;
  if (variant !== undefined && !BUTTON_VARIANTS.some((known) => known === variant)) {
    throw new Error(`Button variant must be ${BUTTON_VARIANTS.join(' or ')}`);
  }
  if (role !== undefined && !BUTTON_ROLES.some((known) => known === role)) {
    throw new Error(`Button role must be ${BUTTON_ROLES.join(' or ')}`);
  }
}

export const BUTTON: ElementDef = {
  name: 'Button',
  props: [
    'key',
    'label',
    'onPress',
    'hotkey',
    'plain',
    'dimColor',
    'autoFocus',
    'action',
    'variant',
    'role',
    'hover',
  ],
  children: 'label',
  construct,
  check: (props) =>
    firstProblem(
      textOf('Button', props, 'label'),
      textOf('Button', props, 'action'),
      callback('Button', props, 'onPress'),
      trueOnly('Button', props, 'autoFocus'),
      hotkeyProblem(props),
    ),
};

/** Whether `node` is a `Button`. */
export const isButton = (node: ElementNode): boolean => node.type === BUTTON.name;

/**
 * The key a button is addressed by: its `key`, else its `label`, else its single string child
 * ("A `Button` can go without a `key` when it has a `label` prop or a single string child. Its key
 * is then the `label` value or that string"; "the `label` ... defaults to the text of its children").
 */
export function buttonKey(node: ElementNode): string | undefined {
  const { key, label } = node.props;
  if (typeof key === 'string' && key !== '') return key;
  if (typeof label === 'string' && label !== '') return label;
  const [only] = node.children;
  return node.children.length === 1 && typeof only === 'string' && only !== '' ? only : undefined;
}
