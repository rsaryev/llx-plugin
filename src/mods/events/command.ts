import { z } from 'zod';
import type { MOD_EVENT_GROUPS } from '../../protocol/mods-events.ts';
import { isRecord } from '../../protocol/is-record.ts';
import { answer, count, fields, flag, noFields, sameData, text, type EventSpec } from './spec.ts';

/**
 * The command events (reference.md, "Commands and configuration"; api.md, "Add a command").
 * `config.set` and `config.describe` are in `config.ts`.
 */
type CommandEvent = Extract<(typeof MOD_EVENT_GROUPS.commands)[number], `command.${string}`>;

/**
 * The fields of `command.run` a hook cannot change (claude-code/index.d.ts:1836, `CommandRunInput`):
 * `command` ("A rewrite is refused") and `presentation` ("Pinned: ... a rewrite that leaves it out
 * keeps it and one that changes it is refused"); `origin` "`next(e)` passes it on as received".
 */
function commandChange(original: unknown, changed: unknown): string | undefined {
  if (!isRecord(original) || !isRecord(changed)) return undefined;
  if (changed.command !== original.command)
    return 'command.run: a hook may not rewrite e.command, only e.args';
  const kept = changed.presentation === undefined;
  return kept || sameData(changed.presentation, original.presentation)
    ? undefined
    : 'command.run: e.presentation is pinned, a hook may not change it';
}

/** What Claude Code runs: the args the hooks passed on, with the event's own origin and presentation. */
function commandAsFired(original: unknown, passed: unknown): unknown {
  if (!isRecord(original) || !isRecord(passed)) return passed;
  const pinned = Object.fromEntries(
    (['origin', 'presentation'] as const).flatMap((key) =>
      original[key] === undefined ? [] : [[key, original[key]]],
    ),
  );
  return { ...passed, ...pinned };
}

export const COMMAND_SPECS: { readonly [N in CommandEvent]: EventSpec } = {
  // `e.command` is the command's name and `e.args` what was typed after it. A hook answers
  // `{ text }` to print, `{}` to print nothing, or `next(e)`.
  'command.run': {
    input: fields({
      command: text,
      args: text.optional(),
      origin: z.looseObject({ kind: text }).optional(),
      presentation: z.looseObject({ isFullscreen: flag, columns: count }).optional(),
    }),
    result: answer({ text: text.optional() }),
    changeProblem: commandChange,
    coreInput: commandAsFired,
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

/**
 * The reply when a command a mod registered reaches the end of the `command.run` chain with no answer
 * (troubleshoot.md, "`no command.run hook answered it`"): "the reply names the mod and the command, as
 * in `first-mod registered /tally but no command.run hook answered it`, then tells you to add a hook".
 * The instruction is the kit's wording (judgment: the docs give the sentence it follows, not its words).
 */
export const unansweredCommandReply = (plugin: string, command: string): string =>
  `${plugin} registered /${command} but no command.run hook answered it. Add a command.run hook for /${command} that returns { text }.`;

/**
 * Where a `command.run` chain ends, one end for the user's `/name` (`ModsHost.runCommand`) and a
 * mod's `$.command.run`: a command a mod registered ends in `unansweredCommandReply`, since its body
 * is its hooks and "a run no hook answers says so as its output" (claude-code/index.d.ts:3282); any
 * other in `host`, the host's run of the command's body. The host is never handed a mod's command, so
 * its run cannot fire `command.run` a second time.
 */
export function commandRunEnd<T>(
  registeredBy: string | undefined,
  command: string,
  host: () => T,
): T | Promise<{ readonly text: string }> {
  return registeredBy === undefined
    ? host()
    : Promise.resolve({ text: unansweredCommandReply(registeredBy, command) });
}
