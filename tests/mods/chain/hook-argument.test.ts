/**
 * The three arguments of a hook, and the middleware chain they come from.
 * plugins/mods/reference.md § The hook function (`$`, `e`, `next(e)`, `next.signal`,
 * `next.origin`); plugins/mods/events.md § How a hook handles an event (observe, rewrite, answer)
 * and § The order mods run in.
 */
import { describe, expect, test } from 'bun:test';
import { MODS_API } from '../../../src/protocol/mods-api-names.ts';
import { consume, fn, gen, harness, record } from '../../support/mods-chain.ts';
import { spec } from '../../support/spec.ts';

const own = ($: { plugin: { name: unknown; root: unknown } }) => [$.plugin.name, $.plugin.root];

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

  test('every namespace holds exactly the methods the reference lists, and one call per namespace reaches its method through the guarded $', async () => {
    const h = harness();
    const namespaces = Object.entries(MODS_API).filter(([name]) => name !== 'plugin');
    const calls: string[] = [];
    const overrides = Object.fromEntries(
      namespaces.map(([name, methods]) => [
        `${name}.${methods[0]}`,
        () => (calls.push(`${name}.${methods[0]}`), `${name}-answer`),
      ]),
    );
    const keys: Record<string, string[]> = {};
    const answers: unknown[] = [];
    h.mod(
      'my-mod',
      'user',
      [
        fn('tool.call', async ($, e, next) => {
          for (const [name, methods] of namespaces) {
            const namespace: unknown = Reflect.get($, name);
            keys[name] = Object.keys(record(namespace));
            const call: unknown = Reflect.get(record(namespace), methods[0]);
            if (typeof call === 'function') answers.push(await call('arg'));
          }
          return next(e);
        }),
      ],
      overrides,
    );
    await h.fire('tool.call');
    expect(Object.keys(MODS_API)).toHaveLength(21);
    expect(keys).toEqual(
      Object.fromEntries(namespaces.map(([name, methods]) => [name, [...methods]])),
    );
    expect(calls).toEqual(namespaces.map(([name, methods]) => `${name}.${methods[0]}`));
    expect(answers).toEqual(namespaces.map(([name]) => `${name}-answer`));
  });

  test('$.plugin holds the name and directory of the mod, in a generator hook and in a .catch handler too', async () => {
    const h = harness();
    const seen: unknown[] = [];
    h.mod('step-mod', 'user', [
      gen('turn.step', async function* ($, e, next) {
        seen.push(own($));
        return yield* next(e);
      }),
    ]);
    h.mod('catch-mod', 'user', [
      fn('tool.call', () => Promise.reject(new Error('boom')), {
        handler: ($, e) => (seen.push(own($)), Promise.resolve(e)),
      }),
    ]);
    await consume(h.fireStream('turn.step'));
    await h.fire('tool.call');
    expect(seen).toEqual([
      ['step-mod', '/plugins/step-mod'],
      ['catch-mod', '/plugins/catch-mod'],
    ]);
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

describe('whose object is frozen (judgment)', () => {
  test('the event object the host passes is frozen in place, and so is the changed event a hook passes to next', async () => {
    const h = harness();
    const original = { text: 'hi', nested: { a: [1] } };
    const changed = { text: 'changed' };
    h.mod('my-mod', 'user', [fn('prompt.submit', (_$, _e, next) => next(changed))]);
    await h.fire('prompt.submit', original);
    expect(Object.isFrozen(original)).toBe(true);
    expect(Object.isFrozen(original.nested)).toBe(true);
    expect(Object.isFrozen(original.nested.a)).toBe(true);
    expect(Object.isFrozen(changed)).toBe(true);
  });
});
