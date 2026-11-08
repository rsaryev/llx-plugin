/** Helpers for the tests of `buildHookInput` and its parts (hooks/input). */
import { z } from 'zod';
import { buildHookInput, serializeHookInput } from '../../src/hooks/input/index.ts';
import type { EventFactsOf, HookSession } from '../../src/hooks/contracts.ts';
import type { HookEvent } from '../../src/protocol/official.ts';
import { FACTS, session } from './hooks-select.ts';

export { session };

/** What a hook reads: the built input as the JSON of stdin (or of an HTTP body), parsed back. */
export type Wire = Record<string, unknown>;
const WireSchema = z.record(z.string(), z.unknown());

/** The sample facts of `event` with `overrides`; a key set to `undefined` is removed first. */
export function facts<E extends HookEvent>(
  event: E,
  overrides: Readonly<Record<string, unknown>> = {},
): EventFactsOf<E> {
  const merged: Record<string, unknown> = { ...FACTS[event], ...overrides };
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) delete merged[key];
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- overrides deliberately carry values of the wrong type, to prove they are refused
  return merged as EventFactsOf<E>;
}

/** Builds the input of `event` from sample facts with `overrides`, returns it as the hook reads it. */
export function build<E extends HookEvent>(
  event: E,
  overrides: Readonly<Record<string, unknown>> = {},
  sessionOverrides: Partial<HookSession> = {},
) {
  const built = buildHookInput(event, facts(event, overrides), session(sessionOverrides));
  const wire: Wire | undefined =
    built.input === undefined
      ? undefined
      : WireSchema.parse(JSON.parse(serializeHookInput(built.input)));
  return { ...built, wire };
}
