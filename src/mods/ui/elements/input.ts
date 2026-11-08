import { callback, firstProblem, textOf, trueOnly, type ElementDef } from './def.ts';
import type { Props } from './node.ts';

function rowsProblem(props: Props): string | undefined {
  const { rows } = props;
  if (rows === undefined || (typeof rows === 'number' && Number.isInteger(rows) && rows >= 1)) {
    return undefined;
  }
  return 'Input prop "rows" must be a whole number, 2 or more for several lines';
}

export const INPUT: ElementDef = {
  name: 'Input',
  props: [
    'key',
    'label',
    'placeholder',
    'value',
    'submitLabel',
    'rows',
    'onSubmit',
    'onInput',
    'autoFocus',
  ],
  children: 'none',
  check: (props) =>
    firstProblem(
      textOf('Input', props, 'label'),
      textOf('Input', props, 'placeholder'),
      textOf('Input', props, 'value'),
      textOf('Input', props, 'submitLabel'),
      rowsProblem(props),
      callback('Input', props, 'onSubmit'),
      callback('Input', props, 'onInput'),
      trueOnly('Input', props, 'autoFocus'),
    ),
};
