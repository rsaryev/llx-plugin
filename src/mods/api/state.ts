import { z } from 'zod';
import type { ModsNamespaceApi } from '../types.ts';
import { call, parse, type Deps } from './call.ts';

/**
 * The values of `$.state` (interface.md, "Keep a value in `$.state`"): kept for the length of a
 * session, shared by every mod, surviving a reload of a module, and reset by `/clear`, `/resume`
 * and `/branch`. A write tells the listeners, so a site that read the value redraws.
 */
export interface StateStore {
  get(plugin: string, key: string): unknown;
  set(plugin: string, key: string, value: unknown): void;
  /** Called after each write, with the value's plugin and key. */
  onWrite(listener: (plugin: string, key: string) => void): () => void;
  /** Called after each read: a `ui.render` hook that reads a value subscribes to it. */
  onRead(listener: (plugin: string, key: string) => void): () => void;
  /** Every value back to its default, as `/clear`, `/resume` and `/branch` do. */
  reset(): void;
}

const id = (plugin: string, key: string): string => JSON.stringify([plugin, key]);

export function createStateStore(): StateStore {
  const values = new Map<string, unknown>();
  const writes = new Set<(plugin: string, key: string) => void>();
  const reads = new Set<(plugin: string, key: string) => void>();
  return {
    get(plugin, key) {
      for (const listener of reads) listener(plugin, key);
      return values.get(id(plugin, key));
    },
    set(plugin, key, value) {
      values.set(id(plugin, key), value);
      for (const listener of writes) listener(plugin, key);
    },
    onWrite(listener) {
      writes.add(listener);
      return () => writes.delete(listener);
    },
    onRead(listener) {
      reads.add(listener);
      return () => reads.delete(listener);
    },
    reset: () => values.clear(),
  };
}

const ref = z.looseObject({ plugin: z.string(), key: z.string() });
const write = z.looseObject({ plugin: z.string(), key: z.string(), value: z.unknown() });

/** `$.state`: `get` and `set` by `{ plugin, key }`; the helpers `atom`, `read` and `update` call them. */
export function stateApi(deps: Deps): ModsNamespaceApi<'state'> {
  return {
    get: async (...args) => {
      const { plugin, key } = parse('$.state.get', ref, args[0]);
      return call(deps, 'state.get', { plugin, key }, (e) => {
        const at = parse('$.state.get', ref, e);
        return Promise.resolve(deps.state.get(at.plugin, at.key));
      });
    },
    set: async (...args) => {
      const { plugin, key } = parse('$.state.set', ref, args[0]);
      return call(deps, 'state.set', { plugin, key, value: args[1] }, (e) => {
        const at = parse('$.state.set', write, e);
        deps.state.set(at.plugin, at.key, at.value);
        return Promise.resolve(undefined);
      });
    },
  };
}
