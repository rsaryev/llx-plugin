import type { ApiEventName } from '../../src/protocol/mods-events.ts';
import { API_EVENT_NAMES } from '../../src/protocol/mods-events.ts';
import { DECLARED } from './mods-declarations.ts';
import { drive } from './mods-api-drive.ts';
import { HOST_ANSWERS } from './mods-host-answers.ts';
import { CALL_SAMPLES, NOT_FIRED_BY_A_CALL } from './mods-api-samples.ts';
import { shapeProblems, signatureText } from './declared-shapes.ts';

/**
 * The calls of `$` against their declarations (AGENTS.md, E2a), one line for each difference: the
 * arguments the kit is called with against the declared parameters (how many, positional or an
 * object, the shape of each), the event a call fires against the declared op event's input, and
 * what a call settles with against its declared result.
 */

type Declared = (typeof DECLARED.api)[string][string];

const isApiEvent = (name: string): name is ApiEventName =>
  (API_EVENT_NAMES as readonly string[]).includes(name);

/** Every declared call of `$` the kit makes, with its declaration. */
function declaredCalls(): readonly (readonly [ApiEventName, Declared])[] {
  return Object.entries(DECLARED.api).flatMap(([namespace, members]) =>
    Object.entries(members).flatMap(([method, declared]) => {
      const event = `${namespace}.${method}`;
      return isApiEvent(event) && declared.calls.length > 0 ? [[event, declared] as const] : [];
    }),
  );
}

/** Why `args` fits no overload of `call`, the overload it comes nearest to first, or none when one fits. */
function argumentProblems(args: readonly unknown[], declared: Declared): string[] {
  let best: string[] | undefined;
  for (const { params } of declared.calls) {
    const extra =
      args.length > params.length ? [`takes ${params.length} arguments, given ${args.length}`] : [];
    const each = params.flatMap((param, index) => {
      const at = `argument ${index + 1} (${param.name})`;
      if (index >= args.length)
        return param.optional ? [] : [`${at} is missing, declared required`];
      return shapeProblems(args[index], param.shape, at);
    });
    const problems = [...extra, ...each];
    if (problems.length === 0) return [];
    if (!best || problems.length < best.length) best = problems;
  }
  return best ?? [];
}

/** The arguments the kit's calls are made with (`CALL_SAMPLES`) against the declared parameters. */
export function paramDifferences(): string[] {
  return declaredCalls().flatMap(([event, declared]) => {
    const [first] = declared.calls;
    const signature = first ? signatureText(first.params) : '()';
    return argumentProblems(CALL_SAMPLES[event], declared).map(
      (problem) => `$.${event}${signature}: ${problem}`,
    );
  });
}

type Fields = (typeof DECLARED.events)[string]['input'];

/**
 * The fields an event's input declares for what the kit fired. `tool.call` is a union of one shape
 * per tool, of which the snapshot keeps the fields all share (scripts/spec/declarations/extract.ts,
 * `MANY_VARIANTS`); "the tool's arguments beside them" (claude-code/index.d.ts:14180) are the named
 * tool's declared input, any shape.
 */
function inputFieldsOf(event: string, fields: Fields, seen: unknown): Fields {
  const tool: unknown = event === 'tool.call' ? Reflect.get(Object(seen), 'tool') : undefined;
  const own = typeof tool === 'string' ? (DECLARED.tools[tool] ?? []) : [];
  return [...fields, ...own.map((one) => ({ ...one, shape: [{ kind: 'any' as const }] }))];
}

/** The event each call fires, as a hook before the caller sees it, against the declared op event's input. */
export async function opEventDifferences(): Promise<string[]> {
  const lines: string[] = [];
  for (const [event] of declaredCalls()) {
    const declared = DECLARED.events[event];
    if (!declared || event in NOT_FIRED_BY_A_CALL) continue;
    const { seen } = await drive(event, 'value');
    const shape = [
      { kind: 'object' as const, fields: inputFieldsOf(event, declared.input, seen[0]) },
    ];
    lines.push(
      ...shapeProblems(seen[0], shape, 'e').map((problem) => `event ${event} input: ${problem}`),
    );
  }
  return lines;
}

/** The calls whose result a test cannot read from the call: a timer is its handle, a fired call nothing. */
const NO_RESULT_READ: ReadonlySet<string> = new Set(['clock.after', 'clock.every']);

/** What each call settles with over host ports that answer (`HOST_ANSWERS`), against its declared result. */
export async function resultDifferences(): Promise<{ lines: string[]; unread: string[] }> {
  const lines: string[] = [];
  const unread: string[] = [];
  for (const [event, declared] of declaredCalls()) {
    if (NO_RESULT_READ.has(event)) continue;
    const { outcome } = await drive(event, 'next', HOST_ANSWERS);
    if (!('resolved' in outcome)) {
      unread.push(`${event}: ${outcome.rejected}`);
      continue;
    }
    const shape = declared.calls.flatMap((one) => one.result);
    lines.push(
      ...shapeProblems(outcome.resolved, shape, 'result').map((problem) => `$.${event} ${problem}`),
    );
  }
  return { lines, unread };
}
