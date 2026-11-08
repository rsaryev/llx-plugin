import type { ModNotice } from '../../src/mods/load/index.ts';
import { createModSet } from '../../src/mods/load/mod-set.ts';
import { wire } from '../../src/mods/load/wiring.ts';
import {
  fakeModInterface,
  fakePorts,
  type RegisterFunction,
} from '../../src/testing/mods/index.ts';
import { policy, runtimeOf, textCompiler } from './mods-load.ts';

/** A mod set built from the parts a host gives it, with a spy on what it tells the replay ledger to forget. */
export function modSetOf(registers: Readonly<Record<string, RegisterFunction>>) {
  const debug: string[] = [];
  const forgotten: string[] = [];
  const notices: ModNotice[] = [];
  const wired = wire({
    ports: fakePorts().ports,
    iface: fakeModInterface(),
    runtime: runtimeOf(registers),
    compiler: textCompiler,
    policy: policy(),
    deny: { verdict: () => Promise.resolve('none') },
    debug: (line) => debug.push(line),
    report: () => undefined,
    signal: new AbortController().signal,
  });
  const set = createModSet({
    wired,
    policy: policy(),
    debug: (line) => debug.push(line),
    announce: () => Promise.resolve(),
    forget: (name) => forgotten.push(name),
    notify: (notice) => notices.push(notice),
    session: () => ({ isInteractive: true, pluginDir: false }),
  });
  return { set, env: wired.env, debug, forgotten, notices };
}
