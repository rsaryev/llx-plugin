/**
 * The three arguments of a hook, and the middleware chain they come from.
 * plugins/mods/reference.md § The hook function (`$`, `e`, `next(e)`, `next.signal`,
 * `next.origin`); plugins/mods/events.md § How a hook handles an event (observe, rewrite, answer)
 * and § The order mods run in.
 */
import { describe, expect, test } from 'bun:test';
import { MOD_TIERS, type HookOrigin } from '../../../src/protocol/mods-events.ts';
import { MODS_API } from '../../../src/protocol/mods-api-names.ts';
import { deferred, fn, harness, messageOf, record } from '../../support/mods-chain.ts';
import { spec } from '../../support/spec.ts';

spec('mods.hookArgument.$', () => {
  test('a hook receives the mods API of its own mod, with every namespace of the reference', async () => {
    const h = harness();
    const seen: { name: unknown; namespaces: string[] }[] = [];
    for (const name of ['my-mod', 'other-mod']) {
      h.mod(name, 'user', [
        fn('tool.call', ($, e, next) => {
          seen.push({ name: $.plugin.name, namespaces: Object.keys($) });
          return next(e);
        }),
      ]);
    }
    await h.fire('tool.call', { tool: 'Bash' });
    expect(seen.map((one) => one.name)).toEqual(['my-mod', 'other-mod']);
    expect(seen[0]?.namespaces).toEqual(Object.keys(MODS_API));
  });

  test('a call written in full, namespace then method, reaches the method of that mod with its arguments', async () => {
    const h = harness();
    const calls: unknown[][] = [];
    const answer = { text: 'notes' };
    h.mod(
      'my-mod',
      'user',
      [fn('tool.call', async ($) => ({ read: await $.fs.read('notes.md') }))],
      {
        'fs.read': (...args) => (calls.push(args), Promise.resolve(answer)),
      },
    );
    h.mod('other-mod', 'user', [], { 'fs.read': () => Promise.resolve('wrong mod') });
    const result = await h.fire('tool.call', {});
    expect(calls).toEqual([['notes.md']]);
    expect(result).toEqual({ read: answer });
  });
});

spec('mods.hookArgument.e', () => {
  test('the event is deeply frozen plain data: assigning to a field throws', async () => {
    const h = harness();
    const failures: string[] = [];
    h.mod('my-mod', 'user', [
      fn('prompt.submit', (_$, e, next) => {
        const attempts: [string, () => void][] = [
          ['field', () => void (e.text = 'changed')],
          ['nested', () => void (record(e.options).trim = false)],
          ['added', () => void (e.extra = 1)],
        ];
        for (const [label, attempt] of attempts) {
          try {
            attempt();
          } catch (error) {
            if (error instanceof TypeError) failures.push(label);
          }
        }
        return next(e);
      }),
    ]);
    await h.fire('prompt.submit', { text: ' hi ', options: { trim: true }, items: ['a'] });
    expect(failures).toEqual(['field', 'nested', 'added']);
  });

  test('an array in the event is frozen too: pushing to it or assigning an element throws', async () => {
    const h = harness();
    const failures: string[] = [];
    h.mod('my-mod', 'user', [
      fn('prompt.submit', (_$, e, next) => {
        const items = Object.values(record(e)).find(Array.isArray);
        for (const [label, attempt] of [
          ['push', () => items?.push('x')],
          ['element', () => void (items && (items[0] = 'x'))],
        ] as const) {
          try {
            attempt();
          } catch (error) {
            if (error instanceof TypeError) failures.push(label);
          }
        }
        return next(e);
      }),
    ]);
    await h.fire('prompt.submit', { items: ['a'] });
    expect(failures).toEqual(['push', 'element']);
  });

  test('to change it, a hook passes a copy to next: later handlers and Claude Code never see the original', async () => {
    const h = harness();
    const later: unknown[] = [];
    const original = { text: '  hello  ' };
    h.mod('first', 'user', [
      fn('prompt.submit', (_$, e, next) => next({ ...e, text: String(e.text).trim() })),
    ]);
    h.mod('second', 'user', [
      fn('prompt.submit', (_$, e, next) => {
        later.push(e.text);
        return next(e);
      }),
    ]);
    await h.fire('prompt.submit', original);
    expect(later).toEqual(['hello']);
    expect(h.coreSeen).toEqual([{ text: 'hello' }]);
    expect(original.text).toBe('  hello  ');
  });

  test('a copy a hook builds is frozen too when it reaches the next handler', async () => {
    const h = harness();
    let frozen: boolean | undefined;
    h.mod('first', 'user', [
      fn('prompt.submit', (_$, e, next) => next({ ...e, nested: { a: [1] } })),
    ]);
    h.mod('second', 'user', [
      fn('prompt.submit', (_$, e, next) => {
        const nested = record(e.nested);
        frozen = Object.isFrozen(nested) && Object.isFrozen(nested.a);
        return next(e);
      }),
    ]);
    await h.fire('prompt.submit', {});
    expect(frozen).toBe(true);
  });
});

describe('next(e): observe, rewrite, answer (events.md § How a hook handles an event)', () => {
  spec('mods.hookArgument.next(e)', () => {
    test("observe: returning next(e) passes the event on and resolves to the event's result", async () => {
      const h = harness();
      h.mod('my-mod', 'user', [fn('tool.call', (_$, e, next) => next(e))]);
      const result = await h.fire('tool.call', { tool: 'Bash' });
      expect(result).toEqual({ core: { tool: 'Bash' } });
    });

    test('act after the event: await next(e), work, and return the result unchanged', async () => {
      const h = harness();
      const log: string[] = [];
      h.mod('my-mod', 'user', [
        fn('tool.call', async (_$, e, next) => {
          log.push('before');
          const result = await next(e);
          log.push('after');
          return result;
        }),
      ]);
      const result = await h.fire(
        'tool.call',
        {},
        {
          core: () => {
            log.push('tool runs');
            return Promise.resolve('output');
          },
        },
      );
      expect(log).toEqual(['before', 'tool runs', 'after']);
      expect(result).toBe('output');
    });

    test('the result can change: next(e), then a copy of the result with a field replaced', async () => {
      const h = harness();
      h.mod('my-mod', 'user', [
        fn('tool.call', async (_$, e, next) => ({ ...record(await next(e)), note: 'seen' })),
      ]);
      expect(
        await h.fire('tool.call', {}, { core: () => Promise.resolve({ output: 'x' }) }),
      ).toEqual({ output: 'x', note: 'seen' });
    });

    test('answer: a result without next short-circuits the chain, so later mods and Claude Code do not run', async () => {
      const h = harness();
      const later: string[] = [];
      const deny = 'Bash is turned off in this project. Use the file tools.';
      h.mod('guard', 'user', [
        fn('tool.call', () => Promise.resolve({ deny }), { matcher: { tool: 'Bash' } }),
      ]);
      h.mod('later', 'user', [fn('tool.call', (_$, e, next) => (later.push('ran'), next(e)))]);
      expect(await h.fire('tool.call', { tool: 'Bash' })).toEqual({ deny });
      expect(later).toEqual([]);
      expect(h.coreSeen).toEqual([]);
    });

    test('retry: calling next(e) again runs what follows a second time', async () => {
      const h = harness();
      let runs = 0;
      h.mod('my-mod', 'user', [
        fn('tool.call', async (_$, e, next) => {
          const first = record(await next(e));
          return first.isError ? next(e) : first;
        }),
      ]);
      const result = await h.fire(
        'tool.call',
        {},
        { core: () => Promise.resolve(++runs === 1 ? { isError: true } : { output: 'ok' }) },
      );
      expect(runs).toBe(2);
      expect(result).toEqual({ output: 'ok' });
    });

    test('the first mod is outermost: it sees the event before the others and the result after them', async () => {
      const h = harness();
      const log: string[] = [];
      for (const name of ['A', 'B']) {
        h.mod(name, 'user', [
          fn('tool.call', async (_$, e, next) => {
            log.push(`${name} in`);
            const result = await next(e);
            log.push(`${name} out`);
            return result;
          }),
        ]);
      }
      await h.fire('tool.call', {}, { core: () => (log.push('core'), Promise.resolve(1)) });
      expect(log).toEqual(['A in', 'B in', 'core', 'B out', 'A out']);
    });
  });
});

spec('mods.hookArgument.next.signal', () => {
  test("an AbortSignal that aborts when the event is abandoned, with the host's reason", async () => {
    const h = harness();
    const abandon = new AbortController();
    const gate = deferred();
    let signal: AbortSignal | undefined;
    let abortedAtStart: boolean | undefined;
    h.mod('my-mod', 'user', [
      fn('tool.call', async (_$, e, next) => {
        signal = next.signal;
        abortedAtStart = next.signal.aborted;
        await gate.promise;
        return next(e);
      }),
    ]);
    const pending = h.fire('tool.call', {}, { signal: abandon.signal });
    await Promise.resolve();
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(abortedAtStart).toBe(false);
    abandon.abort(new Error('the user interrupted'));
    expect(signal?.aborted).toBe(true);
    expect(messageOf(signal?.reason)).toBe('the user interrupted');
    gate.resolve();
    await pending;
  });

  test('an event abandoned before the hook runs gives a signal that is aborted already', async () => {
    const h = harness();
    const abandoned = new AbortController();
    abandoned.abort();
    let aborted: boolean | undefined;
    h.mod('my-mod', 'user', [
      fn('tool.call', (_$, e, next) => ((aborted = next.signal.aborted), next(e))),
    ]);
    await h.fire('tool.call', {}, { signal: abandoned.signal });
    expect(aborted).toBe(true);
  });
});

spec('mods.hookArgument.next.origin', () => {
  test('Claude Code itself is { plugin: engine, tier: core }', async () => {
    const h = harness();
    let origin: HookOrigin | undefined;
    h.mod('my-mod', 'user', [fn('tool.call', (_$, e, next) => ((origin = next.origin), next(e)))]);
    await h.fire('tool.call');
    expect(origin).toEqual({ plugin: 'engine', tier: 'core' });
  });

  test('an event a mod fires carries that mod and its tier, whichever tier it is', async () => {
    const h = harness();
    const seen: HookOrigin[] = [];
    h.mod('watcher', 'user', [fn('fs.read', (_$, e, next) => (seen.push(next.origin), next(e)))]);
    for (const tier of MOD_TIERS.filter((one) => one !== 'core')) {
      await h.fire('fs.read', {}, { origin: { plugin: `mod-${tier}`, tier } });
    }
    expect(seen).toEqual([
      { plugin: 'mod-prepend', tier: 'prepend' },
      { plugin: 'mod-user', tier: 'user' },
      { plugin: 'mod-append', tier: 'append' },
      { plugin: 'mod-builtin', tier: 'builtin' },
    ]);
  });
});
