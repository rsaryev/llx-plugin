import { MOD_LIMITS } from '../../../protocol/mods-limits.ts';
import { firstProblem, textOf, type ElementDef } from './def.ts';
import type { ElementNode } from './node.ts';

export const CLIENT: ElementDef = {
  name: 'Client',
  props: ['module', 'key', 'props', 'width', 'height', 'flexGrow'],
  children: 'none',
  check: (props) => firstProblem(textOf('Client', props, 'module', MOD_LIMITS.fieldChars)),
};

/** `my-mod: Client client/spinner.js: boom` (interface.md, "When a `Client` fails"). */
export const clientFailureLine = (plugin: string, module: string, reason: string): string =>
  `${plugin}: Client ${module}: ${reason}`;

/**
 * What takes a failed `Client`'s place in the terminal: the line above as dimmed text, so "the rest
 * of your drawing still shows". Judgment: the docs say "dimmed" and no more, so it is a `Text` with `dimColor`.
 */
export const clientFailure = (plugin: string, module: string, reason: string): ElementNode => ({
  type: 'Text',
  props: { dimColor: true },
  children: [clientFailureLine(plugin, module, reason)],
});
