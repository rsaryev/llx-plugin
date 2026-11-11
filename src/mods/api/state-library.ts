/**
 * The helpers a hooks module imports from `claude-code` to use `$.state` (reference.md, `$.state`:
 * "the helpers `atom`, `read`, `update`, `derive`, and `memberOf`"; interface.md, "Define, read,
 * and write a value"): `atom` names a value and its default, `read` returns it, `update` writes a
 * new one from the old. The docs describe those three only; what `derive`, `memberOf` and the
 * `shape` option do, and the value `$.state.get` answers, come from Claude Code 2.1.322 run as a
 * black box (oracle 2.1.322, spec/judgments.md). `state-library-source.ts` is the same as text.
 */
import { isRecord } from '../../protocol/is-record.ts';
import { MOD_TIERS } from '../../protocol/mods-tiers.ts';

/** `{ plugin, key }` as the type declaration file names a value; `id` names one member of a family. */
export interface AtomKey {
  readonly plugin: string;
  readonly key: string;
  readonly id?: string;
}

export interface Atom<T> {
  readonly ref: AtomKey;
  readonly initial: T;
  /** The stored value is `{ shape, value }`; one of another shape, or plain, reads as `initial`. */
  readonly shape?: string;
}

/** A value computed from others, again only once one of them changed. */
export interface Derived<T> {
  readonly sources: readonly StateSource[];
  readonly compute: (...values: never) => T;
}

export type StateSource = AtomKey | Atom<unknown> | Derived<unknown>;

/** What `read` gives for a source: an atom's or a derived value's type; a bare key's is unknown. */
export type StateValue<S> = S extends Atom<infer T> ? T : S extends Derived<infer T> ? T : unknown;

type ValuesOf<S extends readonly StateSource[]> = { -readonly [I in keyof S]: StateValue<S[I]> };

/** What the helpers need of `$`: its `state` namespace. */
export interface StateHost {
  readonly state: {
    get(key: AtomKey): unknown;
    set(key: AtomKey, value: unknown, options?: { readonly ifVersion?: number }): unknown;
  };
}

/** `{ plugin, key }`, and `id` when the reference names a member (claude-code/index.d.ts:715, `Atom`). */
const refFrom = (key: AtomKey): AtomKey =>
  key.id === undefined
    ? { plugin: key.plugin, key: key.key }
    : { plugin: key.plugin, key: key.key, id: key.id };

/** The chain's five tiers, outermost first (claude-code/index.d.ts:14132, `TIERS`). */
export const TIERS = Object.freeze(MOD_TIERS);

/** Every tier an instruction file can belong to (claude-code/index.d.ts:5872, `INSTRUCTION_FILE_KINDS`). */
export const INSTRUCTION_FILE_KINDS = Object.freeze([
  'managed',
  'user',
  'project',
  'local',
  'memory',
] as const);

export const atom = <T>(
  key: AtomKey,
  initial: T,
  options: { readonly shape?: string } = {},
): Atom<T> =>
  Object.freeze({
    ref: refFrom(key),
    initial,
    ...(options.shape === undefined ? {} : { shape: options.shape }),
  });

export const derive = <const S extends readonly StateSource[], T>(
  sources: S,
  compute: (...values: ValuesOf<S>) => T,
): Derived<T> => Object.freeze({ sources, compute });

/** The member of `source` for the event's `requestId`; `source` itself when the event has none. */
export function memberOf<S extends AtomKey | Atom<unknown>>(source: S, event: unknown): S {
  const id = isRecord(event) && typeof event.requestId === 'string' ? event.requestId : undefined;
  if (id === undefined) return source;
  return 'ref' in source
    ? Object.freeze({ ...source, ref: { ...source.ref, id } })
    : { ...source, id };
}

const refOf = (source: AtomKey | Atom<unknown>): AtomKey => ('ref' in source ? source.ref : source);

const versionOf = (entry: unknown): number =>
  isRecord(entry) && typeof entry.version === 'number' ? entry.version : 0;

/** What a stored entry holds for a source: a key's value, an atom's value of its shape or its default. */
function valueOf(source: AtomKey | Atom<unknown>, entry: unknown): unknown {
  const held = isRecord(entry) && 'value' in entry;
  if (!('ref' in source)) return held ? entry.value : undefined;
  if (!held) return source.initial;
  if (source.shape === undefined) return entry.value;
  const stored = entry.value;
  return isRecord(stored) && stored.shape === source.shape ? stored.value : source.initial;
}

interface Reading {
  readonly value: unknown;
  readonly versions: readonly number[];
}

/** The last computation of each derived value, for the `$.state` it read and the versions it saw. */
const memos = new WeakMap<Derived<unknown>, Reading & { readonly state: unknown }>();

const sameVersions = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((version, index) => version === b[index]);

async function readingOf($: StateHost, source: StateSource): Promise<Reading> {
  if (!('sources' in source)) {
    const entry = await $.state.get(refOf(source));
    return { value: valueOf(source, entry), versions: [versionOf(entry)] };
  }
  const readings = await Promise.all(source.sources.map((each) => readingOf($, each)));
  const versions = readings.flatMap((reading) => reading.versions);
  const memo = memos.get(source);
  if (memo !== undefined && memo.state === $.state && sameVersions(memo.versions, versions)) {
    return memo;
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the values are the sources' own, in order
  const value = source.compute(...(readings.map((reading) => reading.value) as never));
  memos.set(source, { state: $.state, value, versions });
  return { value, versions };
}

/** The value, or the atom's default while nothing was written; a derived value is computed. */
export async function read<S extends StateSource>($: StateHost, source: S): Promise<StateValue<S>> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the type declaration file says what the key holds
  return (await readingOf($, source)).value as StateValue<S>;
}

/**
 * Writes `change` of the current value and answers the new one; a shaped atom stores `{ shape, value }`.
 * The write names the version it read (`ifVersion`) and a miss reads and applies `change` again
 * (claude-code/index.d.ts:16284, `UpdateFunction`): two updates at once both land.
 */
export async function update<S extends AtomKey | Atom<unknown>>(
  $: StateHost,
  source: S,
  change: (current: StateValue<S>) => StateValue<S>,
): Promise<StateValue<S>> {
  // Read through the reference itself: a derived value is no reference, and `$.state` refuses it.
  const ref = refOf(source);
  const shape = 'ref' in source ? source.shape : undefined;
  for (;;) {
    const held = await $.state.get(ref);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the type declaration file says what the key holds
    const next = change(valueOf(source, held) as StateValue<S>);
    const stored = shape === undefined ? next : { shape, value: next };
    const written = await $.state.set(ref, stored, { ifVersion: versionOf(held) });
    if (!isRecord(written) || written.isSet !== false) return next;
  }
}
