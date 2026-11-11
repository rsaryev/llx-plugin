/** Helpers for the tests of the output stage (hooks/output): parse, cap and merge over real stages. */
import { createOutputStage, mergeOutputs, parseHookOutput } from '../../src/hooks/index.ts';
import type { MergedOutput, TaggedOutput } from '../../src/hooks/index.ts';
import type { HookEvent } from '../../src/protocol/official.ts';
import type { EventFactsOf } from '../../src/hooks/index.ts';
import { fire } from './hooks-fire.ts';
import { command, entry, FACTS } from './hooks-select.ts';

/** What one hook printed: its JSON, or its plain stdout, as the verdict stage hands them on. */
export interface Printed {
  readonly json?: unknown;
  readonly plain?: { readonly text: string; readonly as: 'context' | 'compaction-instructions' };
  readonly ignored?: boolean;
}

export const stage = createOutputStage();

/** The JSON of a hook as the output stage reads it; a failure is a test bug, not a result. */
function checked(event: HookEvent, json: unknown): object {
  const result = parseHookOutput(event, json);
  if (result.output === undefined) throw new Error(`unexpected failure: ${result.failure}`);
  return result.output;
}

/** The tagged outputs of several hooks, in registry order, each parsed like the verdict stage does. */
export function taggedFrom(event: HookEvent, printed: readonly unknown[]): TaggedOutput[] {
  return printed.map((item) => {
    const hook = entry(event);
    const given = isPrinted(item) ? item : { json: item };
    return {
      handler: hook,
      ...(given.json === undefined ? {} : { output: checked(event, given.json) }),
      ...(given.plain === undefined ? {} : { plainText: given.plain }),
      ...(given.ignored === true ? { effectsIgnored: true } : {}),
    };
  });
}

const isPrinted = (item: unknown): item is Printed =>
  typeof item === 'object' && item !== null && ('json' in item || 'plain' in item);

/** The merge of what several hooks printed on `event`. */
export function merged(
  event: HookEvent,
  printed: readonly unknown[],
  facts: object = FACTS[event],
): MergedOutput {
  return mergeOutputs(event, taggedFrom(event, printed), facts);
}

/** `hookSpecificOutput` for `event` with `fields`. */
export const specific = (event: HookEvent, fields: object): object => ({
  hookSpecificOutput: { hookEventName: event, ...fields },
});

/**
 * `event` fired through the real engine, one command hook per entry of `printed`, each exiting 0
 * with that JSON on stdout (a string is printed as it is): the whole path from stdout to outcome.
 */
export async function viaEngine<E extends HookEvent>(
  event: E,
  printed: readonly unknown[],
  facts?: EventFactsOf<E>,
) {
  const hooks = printed.map((_item, index) =>
    entry(event, { handler: command(`./hook-${index}.sh`) }),
  );
  const replies = printed.map((item) => ({
    exitCode: 0,
    stdout: typeof item === 'string' ? item : JSON.stringify(item),
  }));
  const { outcome } = await fire(event, hooks, replies, {
    output: stage,
    ...(facts === undefined ? {} : { facts }),
  });
  return outcome;
}
