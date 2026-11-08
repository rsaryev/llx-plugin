import { MODS_API } from '../../protocol/mods-api-names.ts';
import { API_EVENT_NAMES, STREAM_EVENTS, type ApiEventName } from '../../protocol/mods-events.ts';
import type { ModsApi, SyncEventName, TimerEventName } from '../types.ts';

/**
 * How a member of `$` answers (judgment: the docs publish the declarations of the mods API, not a
 * description of them): a `value` is read, a `call` returns a promise, a `sync` call answers at once
 * (`$.ui.resolve`, destructured without `await`), a `timer` returns `{ cancel }` at once, and a
 * `stream` returns the async generator of the command's output.
 */
export type ApiMemberKind = 'value' | 'call' | 'sync' | 'timer' | 'stream';

export interface ApiMember {
  readonly name: string;
  readonly kind: ApiMemberKind;
  /** True when the member answers later: a call and a stream. A value, a sync call and a timer answer at once. */
  readonly async: boolean;
  /** The event a call fires (reference.md, "Mods API calls"); absent on a value, and on a method another mod added. */
  readonly event?: ApiEventName;
}

export interface ApiNamespace {
  readonly name: string;
  readonly members: readonly ApiMember[];
}

/** `$` as plain data: every namespace in its order, and each member with how it answers. */
export type ApiDescription = readonly ApiNamespace[];

/** The calls `ModsNamespaceApi` types as `ModsSyncMember` and `ModsTimerMember`: adding one to the union fails here until it is listed. */
const SYNC_CALLS = { 'ui.resolve': true } satisfies Record<SyncEventName, true>;
const TIMER_CALLS = { 'clock.after': true, 'clock.every': true } satisfies Record<
  TimerEventName,
  true
>;

/** What each call that is not a plain promise answers with, by the event it fires. */
const SHAPED: ReadonlyMap<string, ApiMemberKind> = new Map<string, ApiMemberKind>([
  ...Object.keys(SYNC_CALLS).map((event): [string, ApiMemberKind] => [event, 'sync']),
  ...Object.keys(TIMER_CALLS).map((event): [string, ApiMemberKind] => [event, 'timer']),
  ...STREAM_EVENTS.map((event): [string, ApiMemberKind] => [event, 'stream']),
]);

const API_EVENTS: ReadonlySet<string> = new Set(API_EVENT_NAMES);
const isApiEvent = (name: string): name is ApiEventName => API_EVENTS.has(name);

/** The namespaces of the reference: only they name events; a namespace another mod added does not. */
const BUILT_IN: ReadonlySet<string> = new Set(Object.keys(MODS_API));

const ASYNC_KINDS: ReadonlySet<ApiMemberKind> = new Set<ApiMemberKind>(['call', 'stream']);

/** The members of a namespace in the order of the reference's table, then any another mod added. */
function namesIn(namespace: string, live: Readonly<Record<string, unknown>>): readonly string[] {
  const table: readonly string[] = Reflect.get(MODS_API, namespace) ?? [];
  const listed = table.filter((name) => name in live);
  return [...listed, ...Object.keys(live).filter((name) => !table.includes(name))];
}

function describeMember(namespace: string, name: string, live: unknown): ApiMember {
  const named = `${namespace}.${name}`;
  const event = BUILT_IN.has(namespace) && isApiEvent(named) ? named : undefined;
  const kind: ApiMemberKind =
    typeof live === 'function' ? ((event && SHAPED.get(event)) ?? 'call') : 'value';
  return { name, kind, async: ASYNC_KINDS.has(kind), ...(event ? { event } : {}) };
}

/**
 * The shape of a mod's `$` as plain data, read from the live API (so a namespace another mod added
 * on `engine.create` is described, and one it withheld is not) and the table of the reference (so a
 * member that fires an event names it). A host that runs mods in another realm sends this across and
 * rebuilds `$` there: a `value` is copied, and each call is sent back to the host, which answers a
 * `sync` call and a `timer` at once and any other call with a promise. No arity is reported: the
 * docs' declarations (`the types for your build`) are not part of the pages the kit reads.
 */
export function describeApi(api: ModsApi): ApiDescription {
  return Object.entries(api).map(([namespace, members]) => {
    const live: Readonly<Record<string, unknown>> = Object(members);
    return {
      name: namespace,
      members: namesIn(namespace, live).map((name) => describeMember(namespace, name, live[name])),
    };
  });
}
