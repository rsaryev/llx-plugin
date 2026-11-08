import type { ModRuntime, WorkerCrash } from '../../src/mods/ports.ts';
import type { ModNotice } from '../../src/mods/load/index.ts';
import type { ModHostPorts } from '../../src/mods/api/index.ts';
import { fakePorts, type RegisterFunction } from '../../src/testing/mods/index.ts';
import { session, runtimeOf, type Session } from './mods-load.ts';

/** A runtime whose worker a test can crash: what a host's runtime signals when its worker stops. */
export interface CrashableRuntime {
  readonly runtime: ModRuntime;
  /** How many times each mod's module was evaluated. */
  readonly loads: Map<string, number>;
  /** The worker stops: the host's handling is awaited, as a runtime that waits for it would. */
  crash(crash: WorkerCrash): Promise<void>;
}

function crashableRuntime(registers: Readonly<Record<string, RegisterFunction>>): CrashableRuntime {
  const inner = runtimeOf(registers);
  const listeners = new Set<(crash: WorkerCrash) => Promise<void>>();
  const loads = new Map<string, number>();
  const runtime: ModRuntime = {
    load: (input, signal) => {
      loads.set(input.plugin, (loads.get(input.plugin) ?? 0) + 1);
      return inner.load(input, signal);
    },
    onCrash: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
  return {
    runtime,
    loads,
    crash: async (crash) => {
      for (const listener of listeners) await listener(crash);
    },
  };
}

export interface CrashSession extends Session {
  readonly worker: CrashableRuntime;
  /** The lines for people the host handed out, in order. */
  readonly notices: ModNotice[];
}

/** A host over a crashable runtime; `ports` replaces whole ports. */
export function crashSession(
  registers: Readonly<Record<string, RegisterFunction>>,
  ports: Partial<ModHostPorts> = {},
  options: Partial<Parameters<typeof session>[1]> = {},
): CrashSession {
  const worker = crashableRuntime(registers);
  const notices: ModNotice[] = [];
  const base = session(registers, {
    ports: fakePorts(ports).ports,
    runtime: worker.runtime,
    onNotice: (notice) => notices.push(notice),
    ...options,
  });
  return { ...base, worker, notices };
}
