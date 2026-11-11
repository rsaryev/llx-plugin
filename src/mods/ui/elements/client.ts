import { MOD_LIMITS } from '../../../protocol/mods-limits.ts';
import { firstProblem, textOf, type ElementDef } from './def.ts';
import type { ElementNode } from './node.ts';

export const CLIENT: ElementDef = {
  name: 'Client',
  props: ['module', 'key', 'props', 'width', 'height', 'flexGrow'],
  children: 'none',
  check: (props) => firstProblem(textOf('Client', props, 'module', MOD_LIMITS.fieldChars)),
};

/**
 * The reason a failed `Client` shows when its error has no message, such as `throw new Error()`
 * (troubleshoot.md, "`the module failed without a message`"; before v2.1.289 the line showed `Error`).
 */
const NO_MESSAGE = 'the module failed without a message';

/** The reason of a failure: its message, or `NO_MESSAGE` when there is none (an empty or blank message counts as none). */
export function faultReason(message: unknown): string {
  return typeof message === 'string' && message.trim() !== '' ? message : NO_MESSAGE;
}

/** `my-mod: Client client/spinner.js: boom` (interface.md, "When a `Client` fails"). */
export const clientFailureLine = (plugin: string, module: string, reason: unknown): string =>
  `${plugin}: Client ${module}: ${faultReason(reason)}`;

/**
 * What takes a failed `Client`'s place in the terminal: the line above as dimmed text, so "the rest
 * of your drawing still shows". Judgment: the docs say "dimmed" and no more, so it is a `Text` with `dimColor`.
 */
export const clientFailure = (plugin: string, module: string, reason: unknown): ElementNode => ({
  type: 'Text',
  props: { dimColor: true },
  children: [clientFailureLine(plugin, module, reason)],
});
