import { MOD_LIMITS } from '../../../protocol/mods-limits.ts';
import { firstProblem, textOf, type ElementDef } from './def.ts';

export const CODE: ElementDef = {
  name: 'Code',
  props: ['source', 'language', 'path', 'startLine', 'format', 'wrap'],
  children: 'none',
  check: (props) =>
    firstProblem(
      textOf('Code', props, 'source'),
      textOf('Code', props, 'language', MOD_LIMITS.fieldChars),
      textOf('Code', props, 'path', MOD_LIMITS.fieldChars),
    ),
};
