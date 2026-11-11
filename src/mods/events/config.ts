import type { MOD_EVENT_GROUPS } from '../../protocol/mods-events.ts';
import { clampReasonAt } from './reasons.ts';
import { answer, fields, flag, noFields, text, type EventSpec } from './spec.ts';
import { z } from 'zod';

/** The `/config` events (reference.md, "Commands and configuration"). */
type ConfigEvent = Extract<(typeof MOD_EVENT_GROUPS.commands)[number], `config.${string}`>;

export const CONFIG_SPECS: { readonly [N in ConfigEvent]: EventSpec } = {
  // A `/config` row is about to change to `e.value`; a hook passes a changed `value` or answers
  // `{ deny: reason }`, whose reason is cut at 4,096 characters.
  'config.set': {
    input: fields({ value: z.unknown().optional() }),
    result: answer({ deny: text.optional(), value: z.unknown().optional() }),
    settle: (result) => clampReasonAt(result, 'deny'),
  },
  // Once for each `/config` row. Judgment: every field is optional.
  'config.describe': {
    input: noFields,
    result: answer({
      label: text.optional(),
      description: text.optional(),
      isHidden: flag.optional(),
    }),
  },
};
