/**
 * Hooks on the telemetry events. plugins/mods/reference.md § Telemetry: "In a mod you install, give
 * a telemetry hook the filter `{ to: 'collector' }`, as in `on('telemetry.log', { to: 'collector' },
 * hook)`. Without the filter, the mod fails `claude plugin validate`. `*` doesn't match these
 * events." A hook can return `next(e)` or `{ deny: reason }`.
 */
import { describe, expect, test } from 'bun:test';
import { fn, harness } from '../../support/mods-chain.ts';
import { spec } from '../../support/spec.ts';

const EVENTS = ['telemetry.log', 'telemetry.mark'] as const;

describe.each(EVENTS)('%s', (event) => {
  const id = `mods.event.${event}` as const;

  spec(id, () => {
    test("a hook without the filter { to: collector } fails validation, and none of the mod's hooks is loaded", () => {
      const h = harness();
      const issues = h.mod('my-mod', 'user', [
        fn(event, (_$, e, next) => next(e)),
        fn('tool.call', (_$, e, next) => next(e)),
      ]);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ severity: 'error' });
      expect(issues[0]?.message).toContain(`on("${event}")`);
      expect(issues[0]?.message).toContain("{ to: 'collector' }");
    });

    test('a hook with the filter loads and handles the records sent to the collector only', async () => {
      const h = harness();
      const seen: unknown[] = [];
      expect(
        h.mod('my-mod', 'user', [
          fn(event, (_$, e, next) => (seen.push(e.to), next(e)), { matcher: { to: 'collector' } }),
        ]),
      ).toEqual([]);
      await h.fire(event, { to: 'collector', name: 'a' });
      await h.fire(event, { to: 'debug-log', name: 'b' });
      expect(seen).toEqual(['collector']);
    });

    test("the filter is required of every mod outside Claude Code's own built-in ones", () => {
      const h = harness();
      const unfiltered = [fn(event, (_$, e, next) => next(e))];
      expect(h.mod('org', 'prepend', unfiltered)).toHaveLength(1);
      expect(h.mod('org-late', 'append', unfiltered)).toHaveLength(1);
      expect(h.mod('sec-default', 'builtin', unfiltered)).toEqual([]);
    });

    test('* does not match the event: a hook on every event never sees it, and still sees the others', async () => {
      const h = harness();
      const seen: string[] = [];
      h.mod('watch-all', 'user', [fn('*', (_$, e, next) => (seen.push(String(e.name)), next(e)))]);
      await h.fire(event, { to: 'collector', name: event });
      await h.fire('tool.call', { name: 'tool.call' });
      expect(seen).toEqual(['tool.call']);
    });

    test('a hook answers with next(e), or with { deny: reason } and the record is not logged', async () => {
      const h = harness();
      h.mod('privacy', 'user', [
        fn(event, async (_$, e, next) => (e.name === 'secret' ? { deny: 'not logged' } : next(e)), {
          matcher: { to: 'collector' },
        }),
      ]);
      expect(await h.fire(event, { to: 'collector', name: 'secret' })).toEqual({
        deny: 'not logged',
      });
      expect(await h.fire(event, { to: 'collector', name: 'fine' })).toEqual({
        core: { to: 'collector', name: 'fine' },
      });
      expect(h.coreSeen).toHaveLength(1);
    });
  });
});

describe('the telemetry filter (judgment: what counts as giving it)', () => {
  test('a filter that lets collector through counts: an array or an expression, not another value', () => {
    const h = harness();
    const hook = fn('telemetry.log', (_$, e, next) => next(e));
    expect(h.mod('a', 'user', [{ ...hook, matcher: { to: ['collector', 'other'] } }])).toEqual([]);
    expect(h.mod('b', 'user', [{ ...hook, matcher: { to: /^coll/ } }])).toEqual([]);
    expect(h.mod('c', 'user', [{ ...hook, matcher: { to: 'debug-log' } }])).toHaveLength(1);
    expect(h.mod('d', 'user', [{ ...hook, matcher: { name: 'x' } }])).toHaveLength(1);
  });
});
