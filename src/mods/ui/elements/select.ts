import { MOD_LIMITS } from '../../../protocol/mods-limits.ts';
import { callback, firstProblem, trueOnly, type ElementDef } from './def.ts';
import { isRecord, type Props } from './node.ts';

/**
 * `options`: "a list of at least one choice with unique values", each `{ value, label }`; a
 * `value` is at most 10,000 characters (reference.md, "Limits"; interface.md, "Respond to presses and typing").
 */
function optionsProblem(props: Props): string | undefined {
  const { options } = props;
  if (!Array.isArray(options) || options.length === 0) {
    return 'Select prop "options" needs at least one option';
  }
  const seen = new Set<unknown>();
  for (const option of options) {
    const value = isRecord(option) ? option.value : undefined;
    if (typeof value !== 'string') return 'Select option "value" must be a string';
    if (value.length > MOD_LIMITS.fieldChars) {
      return `Select option "value" is longer than ${MOD_LIMITS.fieldChars} characters`;
    }
    if (seen.has(value)) return 'Select prop "options" needs unique values';
    seen.add(value);
  }
  return undefined;
}

export const SELECT: ElementDef = {
  name: 'Select',
  props: ['key', 'label', 'options', 'value', 'onSelect', 'autoFocus'],
  children: 'none',
  check: (props) =>
    firstProblem(
      optionsProblem(props),
      callback('Select', props, 'onSelect'),
      trueOnly('Select', props, 'autoFocus'),
    ),
};
