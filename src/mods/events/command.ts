import type { MOD_EVENT_GROUPS } from '../../protocol/mods-events.ts';
import { answer, fields, flag, noFields, text, type EventSpec } from './spec.ts';

/**
 * The command events (reference.md, "Commands and configuration"; api.md, "Add a command").
 * `config.set` and `config.describe` are in `config.ts`.
 */
type CommandEvent = Extract<(typeof MOD_EVENT_GROUPS.commands)[number], `command.${string}`>;

export const COMMAND_SPECS: { readonly [N in CommandEvent]: EventSpec } = {
  // `e.command` is the command's name and `e.args` what was typed after it. A hook answers
  // `{ text }` to print, `{}` to print nothing, or `next(e)`.
  'command.run': {
    input: fields({ command: text, args: text.optional() }),
    result: answer({ text: text.optional() }),
  },
  // Once for each command, for the command list. Judgment: every field is optional, so a hook
  // can answer with the ones it sets.
  'command.describe': {
    input: noFields,
    result: answer({
      description: text.optional(),
      argumentHint: text.optional(),
      isHidden: flag.optional(),
    }),
  },
};
