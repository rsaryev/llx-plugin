/**
 * Prompt and agent hooks at once: hooks.md § "Hook handler fields" ("When an event fires, its
 * matching hooks run in parallel. If more than 12 of them are prompt or agent hooks, 12 of those
 * run at once and the rest start as running ones finish. Each waiting hook's `timeout` starts
 * counting when that hook starts"). No requirement id names this rule, so the tests sit outside
 * `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { runHandler } from '../../../../src/hooks/handlers/index.ts';
import {
  MAX_MODEL_HOOKS_AT_ONCE,
  runLimited,
} from '../../../../src/hooks/handlers/remote/concurrency.ts';
import type { RegisteredHandler } from '../../../../src/hooks/contracts.ts';
import type { ModelAnswer, ModelRunner, ModelRequest } from '../../../../src/ports/index.ts';
import { agentEntry, promptEntry, remoteContext } from '../../../support/hooks-remote.ts';
import { entry } from '../../../support/hooks-select.ts';

const prompts = (count: number): RegisteredHandler[] =>
  Array.from({ length: count }, () => promptEntry({ prompt: 'p' }, 'Stop'));
const commands = (count: number): RegisteredHandler[] =>
  Array.from({ length: count }, () => entry('Stop'));

/** A run that ends when the test says so. */
function gate() {
  const started: string[] = [];
  const open = new Map<string, () => void>();
  let active = 0;
  let peak = 0;
  return {
    started,
    peak: () => peak,
    finish: (id: string) => open.get(id)?.(),
    run: (item: RegisteredHandler) =>
      new Promise<string>((resolve) => {
        started.push(item.id);
        active += 1;
        peak = Math.max(peak, active);
        open.set(item.id, () => {
          active -= 1;
          resolve(item.id);
        });
      }),
  };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('at most 12 prompt or agent hooks at once', () => {
  test('the limit is 12', () => {
    expect(MAX_MODEL_HOOKS_AT_ONCE).toBe(12);
  });

  test('14 prompt hooks: 12 start, the rest start as running ones finish', async () => {
    const items = prompts(14);
    const control = gate();
    const done = runLimited(items, control.run);
    await tick();
    expect(control.started).toEqual(items.slice(0, 12).map(({ id }) => id));
    control.finish(items[3]?.id ?? '');
    await tick();
    expect(control.started).toHaveLength(13);
    expect(control.started[12]).toBe(items[12]?.id);
    control.finish(items[0]?.id ?? '');
    await tick();
    expect(control.started[13]).toBe(items[13]?.id);
    for (const { id } of items) control.finish(id);
    await done;
    expect(control.peak()).toBe(12);
  });

  test('agent hooks count with prompt hooks', async () => {
    const items = [
      ...prompts(6),
      ...Array.from({ length: 8 }, () => agentEntry({ prompt: 'p' }, 'Stop')),
    ];
    const control = gate();
    const done = runLimited(items, control.run);
    await tick();
    expect(control.started).toHaveLength(12);
    for (const { id } of items) control.finish(id);
    await tick();
    for (const { id } of items) control.finish(id);
    await done;
    expect(control.peak()).toBe(12);
  });

  test('command, http and mcp_tool hooks are not held back', async () => {
    const items = [...prompts(14), ...commands(3)];
    const control = gate();
    const done = runLimited(items, control.run);
    await tick();
    expect(control.started).toHaveLength(15);
    for (const { id } of items) control.finish(id);
    await tick();
    for (const { id } of items) control.finish(id);
    await done;
  });

  test('results come back in the order of the handlers, whatever order they finish in', async () => {
    const items = [...prompts(3), ...commands(2)];
    const control = gate();
    const done = runLimited(items, control.run);
    await tick();
    for (const { id } of items.toReversed()) control.finish(id);
    expect(await done).toEqual(items.map(({ id }) => id));
  });

  test('a limit lower than the hooks still finishes them all', async () => {
    const items = prompts(5);
    const control = gate();
    const done = runLimited(items, control.run, 2);
    await tick();
    expect(control.started).toHaveLength(2);
    for (let round = 0; round < 5; round += 1) {
      for (const { id } of items) control.finish(id);
      await tick();
    }
    expect(await done).toHaveLength(5);
  });

  test("a waiting hook's timeout starts when it starts: its request carries the whole timeout", async () => {
    const requests: ModelRequest[] = [];
    const releases: ((answer: ModelAnswer) => void)[] = [];
    const models: ModelRunner = {
      evaluate: (request) =>
        new Promise((resolve) => {
          requests.push(request);
          releases.push(resolve);
        }),
      runAgent: () => Promise.reject(new Error('no agent')),
    };
    const items = Array.from({ length: 13 }, () =>
      promptEntry({ prompt: 'p', timeout: 45 }, 'Stop'),
    );
    const context = remoteContext({ models });
    const done = runLimited(items, (item) => runHandler(item, context));
    await tick();
    expect(requests).toHaveLength(12);
    releases[0]?.({ text: '{"ok":true}' });
    await tick();
    expect(requests).toHaveLength(13);
    expect(requests[12]?.timeoutMs).toBe(45_000);
    for (const release of releases) release({ text: '{"ok":true}' });
    await done;
  });
});
