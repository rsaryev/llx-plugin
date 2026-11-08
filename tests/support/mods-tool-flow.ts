/** Real event-chain fixture for testing the kit's ordered tool flow, independent of module scanning. */
import { expect } from 'bun:test';
import type { RegisteredHook } from '../../src/mods/types.ts';
import type { ModToolFlow, ModsHost } from '../../src/mods/load/index.ts';
import { ENGINE_ORIGIN } from '../../src/protocol/mods-events.ts';
import { eventHarness } from './mods-events.ts';

export async function openToolFlow(trace: string[], hooks: readonly RegisteredHook[] = []) {
  // Pipeline tests register hooks on the real chain; static module scanning is tested separately.
  const h = eventHarness();
  expect(h.mod('watcher', 'user', hooks)).toEqual([]);
  const host: Pick<ModsHost, 'fire'> = {
    fire: (name, input, options = {}) =>
      h.chain.dispatch(name, input, {
        origin: ENGINE_ORIGIN,
        signal: new AbortController().signal,
        core: options.core ?? (() => Promise.resolve({})),
        report: () => undefined,
        ...(options.before === undefined ? {} : { before: options.before }),
      }),
  };
  const flow: ModToolFlow = {
    host,
    call: { tool: 'Bash', command: 'ls' },
    managed: () => {
      trace.push('managed');
      return Promise.resolve(undefined);
    },
    preToolUse: (call) => {
      trace.push('PreToolUse');
      return Promise.resolve({ call });
    },
    readOnly: { bashCommand: () => true, mcpReadOnlyHint: () => undefined },
    decide: () => {
      trace.push('rules');
      return Promise.resolve({ decision: 'ask' });
    },
    afterCheck: () => {
      trace.push('classifier or PermissionRequest or prompt');
      return Promise.resolve({ decision: 'allow' });
    },
    execute: () => {
      trace.push('execute');
      return Promise.resolve({ stdout: 'ok' });
    },
  };
  return { flow, host };
}
