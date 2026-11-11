import { z } from 'zod';
import { runEach } from '../../foundation/index.ts';
import type { ModsNamespaceApi } from '../types.ts';
import { call, parse, type Deps } from './call.ts';

/** A value of `$.state`: `{ plugin, key }`, and `id` for one member of a family (`memberOf`). */
export interface StateRef {
  readonly plugin: string;
  readonly key: string;
  readonly id?: string;
}

/** What `$.state.get` answers: the value, absent while nothing was written, and its version. */
export interface StateEntry {
  readonly value?: unknown;
  /** 0 while nothing was written; each write adds one. */
  readonly version: number;
}

/** What `$.state.set` answers: whether it wrote, and the version the value has now. */
export interface StateWrite {
  readonly isSet: boolean;
  readonly version: number;
}

/**
 * The values of `$.state` (interface.md, "Keep a value in `$.state`"): kept for the length of a
 * session, shared by every mod, surviving a reload of a module, and reset by `/clear`, `/resume`
 * and `/branch`. A write tells the listeners, so a site that read the value redraws. Each value has
 * a version and a write may name the one it expects (`ifVersion`): oracle 2.1.322, spec/judgments.md.
 */
/** What a store tells its listeners: the value's plugin and key, and `id` for a family's member. */
export type StateListener = (plugin: string, key: string, id?: string) => void;

export interface StateStore {
  get(ref: StateRef): StateEntry;
  /** Writes unless `ifVersion` is given and the value has another version. */
  set(ref: StateRef, value: unknown, ifVersion?: number): StateWrite;
  /** Called after each write, with the value's plugin and key, and the member's `id` for a family's. */
  onWrite(listener: StateListener): () => void;
  /** Called after each read: a `ui.render` hook that reads a value subscribes to it. */
  onRead(listener: StateListener): () => void;
  /**
   * Every value back to its default, as `/clear`, `/resume` and `/branch` do. Judgment: each value
   * that was held counts as written, so a site that read it is drawn again and shows the default
   * (interface.md: "Otherwise your drawing shows the default").
   */
  reset(): void;
}

const idOf = (ref: StateRef): string => JSON.stringify([ref.plugin, ref.key, ref.id ?? null]);

export function createStateStore(): StateStore {
  const values = new Map<string, { ref: StateRef; value: unknown; version: number }>();
  const writes = new Set<StateListener>();
  const reads = new Set<StateListener>();
  return {
    get(ref) {
      for (const listener of reads) listener(ref.plugin, ref.key, ref.id);
      const held = values.get(idOf(ref));
      return held === undefined ? { version: 0 } : { value: held.value, version: held.version };
    },
    set(ref, value, ifVersion) {
      const version = values.get(idOf(ref))?.version ?? 0;
      if (ifVersion !== undefined && ifVersion !== version) return { isSet: false, version };
      values.set(idOf(ref), { ref, value, version: version + 1 });
      for (const listener of writes) listener(ref.plugin, ref.key, ref.id);
      return { isSet: true, version: version + 1 };
    },
    onWrite(listener) {
      writes.add(listener);
      return () => writes.delete(listener);
    },
    onRead(listener) {
      reads.add(listener);
      return () => reads.delete(listener);
    },
    reset() {
      const held = [...values.values()];
      values.clear();
      // A listener that throws does not stop the others from redrawing; the failure is reported once all ran.
      const redraws = held.flatMap(({ ref }) =>
        [...writes].map((listener) => () => listener(ref.plugin, ref.key, ref.id)),
      );
      runEach(redraws, (redraw) => redraw());
    },
  };
}

const REF = z.looseObject({ plugin: z.string(), key: z.string(), id: z.string().optional() });
const OPTIONS = z.looseObject({ ifVersion: z.number().optional() });
const WRITE = REF.extend({ value: z.unknown(), ifVersion: z.number().optional() });

/** oracle 2.1.322: the refusal of a value that is not a reference, a derived value among them. */
const NOT_A_REF = "takes a reference { plugin, key } (and id for a family's member)";

function refOf(deps: Deps, name: string, value: unknown): StateRef {
  const parsed = REF.safeParse(value);
  if (!parsed.success) throw new Error(`${deps.plugin}: $.state.${name} ${NOT_A_REF}`);
  const { plugin, key, id } = parsed.data;
  return { plugin, key, ...(id === undefined ? {} : { id }) };
}

/**
 * `$.state`: `get` answers `{ value, version }`, `set(ref, value, { ifVersion })` answers
 * `{ isSet, version }`; the helpers `atom`, `read`, `update`, `derive` and `memberOf` call them.
 */
export function stateApi(deps: Deps): ModsNamespaceApi<'state'> {
  return {
    get: async (...args) =>
      call(deps, 'state.get', { ...refOf(deps, 'get', args[0]) }, (e) =>
        Promise.resolve(deps.state.get(refOf(deps, 'get', e))),
      ),
    set: async (...args) => {
      const { ifVersion } = parse('$.state.set', OPTIONS, args[2] ?? {});
      const facts = { ...refOf(deps, 'set', args[0]), value: args[1] };
      return call(
        deps,
        'state.set',
        { ...facts, ...(ifVersion === undefined ? {} : { ifVersion }) },
        (e) => {
          const at = parse('$.state.set', WRITE, e);
          return Promise.resolve(deps.state.set(refOf(deps, 'set', at), at.value, at.ifVersion));
        },
      );
    },
  };
}
