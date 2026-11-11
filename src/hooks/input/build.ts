import { error, warning, type PluginIssue } from '../../format/issues.ts';
import type { HookInputOf } from '../../protocol/hook-events.ts';
import type { HookEvent } from '../../protocol/official.ts';
import type { EventFactsOf, HookSession } from '../contracts.ts';
import { commonInput, type CommonInput } from './common.ts';
import { applyConditionalFields } from './conditional-fields.ts';
import { factSchemaOf } from './facts.ts';

/** The input of an event: the official shape, plus the documented `scratchpad_dir`. */
export type BuiltHookInput<E extends HookEvent> = HookInputOf<E> &
  Pick<CommonInput, 'scratchpad_dir'>;

export interface BuiltInput<E extends HookEvent> {
  /** `undefined` when the facts do not make a valid input: the hook does not run. */
  readonly input: BuiltHookInput<E> | undefined;
  /** Errors for facts that fail the official shape, warnings for what was dropped. */
  readonly issues: readonly PluginIssue[];
}

/** `hooks.<Event>.input.<field>`, an array index as `[n]` as in the select stage and the warnings. */
const pathOf = (event: HookEvent, segments: readonly PropertyKey[]): string =>
  segments.reduce<string>(
    (path, segment) =>
      typeof segment === 'number' ? `${path}[${segment}]` : `${path}.${String(segment)}`,
    `hooks.${event}.input`,
  );

/** A field the host set to `undefined` is a field it did not set: JSON cannot carry it. */
const withoutUndefined = (facts: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(facts).filter(([, value]) => value !== undefined));

/**
 * The common fields and the event's own facts as the input of `event`. TypeScript cannot relate
 * the generic `E` to the one member of the `HookInputOf` union it names, so the join of the two
 * halves, each already checked (the facts by the event's schema, the rest by `CommonInput`), is
 * asserted to it here, the one place it is.
 */
const joinInput = <E extends HookEvent>(
  common: CommonInput,
  facts: EventFactsOf<E>,
): BuiltHookInput<E> =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- generic `E` vs one union member, see above
  ({ ...common, ...facts }) as BuiltHookInput<E>;

/**
 * The JSON a command hook reads on stdin and an HTTP hook receives as its POST body, from the
 * event's facts and the session (hooks.md, "Hook input and output"): the common input fields, then
 * the event's own. The facts are checked against the official input type of the event; a wrong
 * type or enum value is an error issue and no input, a field the event does not have or has only in
 * other cases (`conditional-fields.ts`) is dropped with a warning.
 */
export function buildHookInput<E extends HookEvent>(
  event: E,
  facts: EventFactsOf<E>,
  session: HookSession,
): BuiltInput<E> {
  const given = withoutUndefined(facts);
  const parsed = factSchemaOf(event).safeParse(given);
  if (!parsed.success) {
    return {
      input: undefined,
      issues: parsed.error.issues.map((issue) => error(pathOf(event, issue.path), issue.message)),
    };
  }
  const issues: PluginIssue[] = Object.keys(given)
    .filter((key) => !Object.keys(parsed.data).includes(key))
    .map((key) =>
      warning(pathOf(event, [key]), `"${key}" is not a field of the ${event} input and is dropped`),
    );
  const refined = applyConditionalFields(event, parsed.data);
  const common = commonInput(event, session);
  issues.push(...refined.issues, ...common.issues);
  // Facts come last: an event's own `agent_id` and `agent_type` (SubagentStart, SubagentStop) win.
  const input = joinInput<E>(common.fields, refined.facts);
  return { input, issues };
}

/** One JSON text for both transports: stdin of a command hook, body of an HTTP hook. */
export const serializeHookInput = (input: HookInputOf<HookEvent>): string => JSON.stringify(input);
