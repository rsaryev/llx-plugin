/**
 * Judgment (spec/judgments.md, `src/mods/api/state-library-source.ts`): the JavaScript text a host
 * bundles behind `import { atom, read, update, derive, memberOf } from 'claude-code'` does what the
 * kit's own helpers do over the same `$.state` (plugins/mods/interface.md, "Define, read, and write
 * a value"; reference.md, `$.state`, names `derive` and `memberOf`). What `derive`, `memberOf` and
 * `shape` do is oracle 2.1.322 (`claude plugin test`, a black box), as `state-versions.test.ts`.
 */
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  atom,
  derive,
  memberOf,
  read,
  STATE_LIBRARY_SOURCE,
  update,
} from '../../../src/entry/mods.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { rejection } from '../../support/rejection.ts';

interface Helpers {
  readonly atom: typeof atom;
  readonly derive: typeof derive;
  readonly memberOf: typeof memberOf;
  readonly read: typeof read;
  readonly update: typeof update;
}

/** The text is an ES module: write it to a temporary folder and import it as one. */
async function evaluate(): Promise<Helpers> {
  const file = join(mkdtempSync(join(tmpdir(), 'state-library-')), 'claude-code.mjs');
  writeFileSync(file, STATE_LIBRARY_SOURCE);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the source is the helpers' own text
  return (await import(file)) as Helpers;
}

/** Each scenario, run with the kit's helpers and with the text, over a fresh `$`. */
async function both(
  run: (helpers: Helpers, $: Awaited<ReturnType<typeof apiHarness>>['api']) => Promise<unknown>,
) {
  const own = await evaluate();
  const answers = [];
  for (const helpers of [{ atom, derive, memberOf, read, update }, own]) {
    answers.push(await run(helpers, (await apiHarness()).api));
  }
  expect(answers[1]).toEqual(answers[0]);
  return answers[0];
}

const COUNT = { plugin: 'hello-tabs', key: 'count' };

describe('STATE_LIBRARY_SOURCE', () => {
  test('exports atom, derive, memberOf, read and update', async () => {
    expect(Object.keys(await evaluate()).toSorted()).toEqual([
      'INSTRUCTION_FILE_KINDS',
      'TIERS',
      'atom',
      'derive',
      'memberOf',
      'read',
      'update',
    ]);
  });

  test('names a value, reads its default and updates it as the kit helpers do', async () => {
    const answer = await both(async (h, $) => {
      const count = h.atom(COUNT, 0);
      const first = await h.read($, count);
      const updated = await h.update($, count, (value) => value + 1);
      await h.update($, count, (value) => value + 1);
      return [
        count,
        Object.isFrozen(count),
        first,
        updated,
        await h.read($, count),
        await $.state.get(COUNT),
      ];
    });
    expect(answer).toEqual([{ ref: COUNT, initial: 0 }, true, 0, 1, 2, { value: 2, version: 2 }]);
  });

  test('a shaped atom stores { shape, value } and reads its default from another shape', async () => {
    const answer = await both(async (h, $) => {
      const shaped = h.atom(COUNT, 5, { shape: 'v2' });
      await $.state.set(COUNT, 42);
      const fromPlain = await h.read($, shaped);
      await h.update($, shaped, (n) => n + 1);
      return [shaped, fromPlain, await h.read($, shaped), await h.read($, h.atom(COUNT, 0))];
    });
    expect(answer).toEqual([
      { ref: COUNT, initial: 5, shape: 'v2' },
      5,
      6,
      { shape: 'v2', value: 6 },
    ]);
  });

  test('a derived value computes again only once a source changed, and nests', async () => {
    const answer = await both(async (h, $) => {
      let calls = 0;
      const count = h.atom(COUNT, 1);
      const sum = h.derive([count, COUNT], (a, b) => {
        calls += 1;
        return Number(a) * 100 + Number(b ?? 0);
      });
      const once = [await h.read($, sum), await h.read($, sum), calls];
      await h.update($, count, (n) => n + 1);
      const nested = h.derive([sum, count], (x, y) => [x, y]);
      return [Object.keys(sum), Object.isFrozen(sum), once, await h.read($, nested), calls];
    });
    expect(answer).toEqual([['sources', 'compute'], true, [100, 100, 1], [202, 2], 2]);
  });

  test("memberOf names the event's request, and leaves the value alone without one", async () => {
    const answer = await both(async (h, $) => {
      const count = h.atom(COUNT, 1);
      const member = h.memberOf(count, { requestId: 'r1' });
      await h.update($, member, (n) => n + 5);
      return [
        member,
        h.memberOf(COUNT, { requestId: 'r1' }),
        h.memberOf(count, { command: 'probe', args: '' }) === count,
        await h.read($, member),
        await h.read($, count),
      ];
    });
    expect(answer).toEqual([
      { ref: { ...COUNT, id: 'r1' }, initial: 1 },
      { ...COUNT, id: 'r1' },
      true,
      6,
      1,
    ]);
  });

  test('update refuses a derived value as $.state does, through its reference', async () => {
    await both(async (h, $) => {
      const total = h.derive([h.atom(COUNT, 1)], (n) => n * 2);
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a JavaScript module can pass a derived value
      return rejection(h.update($, total as never, (n) => n));
    });
  });

  // Declarations 2.1.321 (AGENTS.md, E2a): `update` writes with `ifVersion` and tries again on a
  // miss (claude-code/index.d.ts:16284, `UpdateFunction`); an atom keeps a reference's `id` (:715).
  test('update applies its change again when another write beat it, and both land', async () => {
    const answer = await both(async (h) => {
      let value = 1;
      let version = 1;
      let beaten = false;
      const $ = {
        state: {
          get: () => Promise.resolve({ value, version }),
          set: (_ref: unknown, next: unknown, options?: { readonly ifVersion?: number }) => {
            if (!beaten) {
              beaten = true;
              value = 10;
              version = 2;
            }
            if (options?.ifVersion !== version) return Promise.resolve({ isSet: false, version });
            value = Number(next);
            version += 1;
            return Promise.resolve({ isSet: true, version });
          },
        },
      };
      const written = await h.update($, h.atom(COUNT, 0), (n) => n + 1);
      return [written, value, version];
    });
    expect(answer).toEqual([11, 11, 3]);
  });

  test('an atom keeps the id of a reference that names a member', async () => {
    const answer = await both(async (h) => h.atom({ ...COUNT, id: 'm1' }, 0).ref);
    expect(answer).toEqual({ ...COUNT, id: 'm1' });
  });
});
