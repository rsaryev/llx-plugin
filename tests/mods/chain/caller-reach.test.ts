/**
 * Which hooks a mod's own call reaches. Declarations 2.1.321 (AGENTS.md, E2a), judged in
 * spec/judgments.md ("Who a mod's call reaches"):
 * - `OpEventOf` (claude-code/index.d.ts:7292): the calls the host serves; "A hook above the caller
 *   passes it on ... The calling hook alone is skipped, and `next.origin` names the caller."
 * - `EventCalls` (:5011): the engine's own events as calls; "a plugin's call runs the same chain with
 *   the calling hook alone skipped"; `$.tool.call` (:3210) "runs through every hook but the calling
 *   one (the plugin's others see it)".
 * - reference.md § The hook function, `next.error`: `re-entry` "when the hook was skipped because the
 *   event came from inside a mods API call by that hook or by your mod's code outside its hooks".
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { describe, expect, test } from 'bun:test';
import type { HookOrigin } from '../../../src/protocol/mods-events.ts';
import { fn, harness, type FireOptions } from '../../support/mods-chain.ts';

/** What a call by `plugin` passes to `fire`: its origin, its re-entry and, as the API sets it, the caller. */
const callBy = (plugin: string, tier: HookOrigin['tier'] = 'user') =>
  ({
    origin: { plugin, tier },
    reentry: { plugin },
    caller: { plugin, tier },
  }) satisfies FireOptions;

describe("the engine's own events reach every hook but the calling one", () => {
  test('a mod after the caller sees its command.run, as do the mods before it', async () => {
    const h = harness();
    const seen: string[] = [];
    const watch = (name: string) => fn('command.run', (_$, e, next) => (seen.push(name), next(e)));
    h.modAt('earlier', 'user', 1, [watch('earlier')]);
    h.modAt('caller', 'user', 2, [
      fn('tool.call', async (_$, e, next) => {
        await h.chain.dispatch(
          'command.run',
          { command: 'x', args: '' },
          {
            ...callBy('caller'),
            signal: new AbortController().signal,
            core: () => Promise.resolve({}),
            report: () => undefined,
          },
        );
        return next(e);
      }),
    ]);
    h.modAt('later', 'append', 3, [watch('later')]);
    await h.fire('tool.call', {});
    expect(seen).toEqual(['earlier', 'later']);
  });

  test("the calling hook is skipped, the caller's other hooks on the event see it", async () => {
    const h = harness();
    const seen: string[] = [];
    let calls = 0;
    h.mod('mod', 'user', [
      fn('tool.call', async (_$, e, next) => {
        seen.push('calling');
        calls += 1;
        if (calls > 1) return { deny: 'ran twice' };
        await h.chain.dispatch(
          'tool.call',
          { tool: 'Read' },
          {
            ...callBy('mod'),
            signal: new AbortController().signal,
            core: () => Promise.resolve({ inner: true }),
            report: () => undefined,
          },
        );
        return next(e);
      }),
      fn('tool.call', (_$, e, next) => (seen.push(`other:${String(e.tool)}`), next(e)), {
        matcher: { tool: ['Read', 'Bash'] },
      }),
    ]);
    await h.fire('tool.call', { tool: 'Bash' });
    expect(seen).toEqual(['calling', 'other:Read', 'other:Bash']);
  });

  test("a call from the mod's code outside its hooks skips every hook of the mod", async () => {
    const h = harness();
    const seen: string[] = [];
    h.mod('mod', 'user', [fn('tool.call', (_$, e, next) => (seen.push('mod'), next(e)))]);
    h.mod('other', 'user', [fn('tool.call', (_$, e, next) => (seen.push('other'), next(e)))]);
    await h.fire('tool.call', { tool: 'Read' }, callBy('mod'));
    expect(seen).toEqual(['other']);
  });

  test('when two hooks of the mod are in flight, both are skipped: the call could be either one (judgment)', async () => {
    const h = harness();
    const seen: string[] = [];
    h.mod('mod', 'user', [
      fn('tool.call', (_$, e, next) => next(e), { matcher: { tool: 'Bash' } }),
      fn(
        'tool.call',
        async (_$, e, next) => {
          seen.push(`second:${String(e.tool)}`);
          if (e.tool !== 'Bash') return next(e);
          await h.chain.dispatch(
            'tool.call',
            { tool: 'Read' },
            {
              ...callBy('mod'),
              signal: new AbortController().signal,
              core: () => Promise.resolve({}),
              report: () => undefined,
            },
          );
          return next(e);
        },
        {},
      ),
    ]);
    await h.fire('tool.call', { tool: 'Bash' });
    expect(seen).toEqual(['second:Bash']);
  });
});

describe('with the host`s async context the chain knows the calling hook', () => {
  test('while two hooks of the mod are in flight, only the one that called is skipped', async () => {
    const h = harness([], { asyncContext: () => new AsyncLocalStorage() });
    const seen: string[] = [];
    h.mod('mod', 'user', [
      fn('tool.call', (_$, e, next) => (seen.push(`first:${String(e.tool)}`), next(e)), {
        matcher: { tool: ['Bash', 'Read'] },
      }),
      fn('tool.call', async (_$, e, next) => {
        seen.push(`second:${String(e.tool)}`);
        if (e.tool !== 'Bash') return next(e);
        await h.chain.dispatch(
          'tool.call',
          { tool: 'Read' },
          {
            ...callBy('mod'),
            signal: new AbortController().signal,
            core: () => Promise.resolve({}),
            report: () => undefined,
          },
        );
        return next(e);
      }),
    ]);
    await h.fire('tool.call', { tool: 'Bash' });
    expect(seen).toEqual(['first:Bash', 'second:Bash', 'first:Read']);
  });

  test("a call from the mod's code outside its hooks still skips every hook of the mod", async () => {
    const h = harness([], { asyncContext: () => new AsyncLocalStorage() });
    const seen: string[] = [];
    h.mod('mod', 'user', [fn('tool.call', (_$, e, next) => (seen.push('mod'), next(e)))]);
    await h.fire('tool.call', { tool: 'Read' }, callBy('mod'));
    expect(seen).toEqual([]);
  });
});

describe('a call the host serves reaches only the hooks at or above the caller', () => {
  test('a mod after the caller never sees its fs.read; one before it does', async () => {
    const h = harness();
    const seen: string[] = [];
    const watch = (name: string) => fn('fs.read', (_$, e, next) => (seen.push(name), next(e)));
    h.modAt('earlier', 'user', 1, [watch('earlier')]);
    h.modAt('caller', 'user', 2, []);
    h.modAt('later', 'user', 3, [watch('later')]);
    await h.fire('fs.read', { path: 'a.md' }, callBy('caller'));
    expect(seen).toEqual(['earlier']);
  });
});
