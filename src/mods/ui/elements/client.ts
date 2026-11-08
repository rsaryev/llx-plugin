import { MOD_LIMITS } from '../../../protocol/mods-limits.ts';
import { firstProblem, textOf, type ElementDef } from './def.ts';

export const CLIENT: ElementDef = {
  name: 'Client',
  props: ['module', 'key', 'props', 'width', 'height', 'flexGrow'],
  children: 'none',
  check: (props) => firstProblem(textOf('Client', props, 'module', MOD_LIMITS.fieldChars)),
};
