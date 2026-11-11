/**
 * oracle 2.1.322 (spec/judgments.md, `src/mods/api/state.ts`): what `$.state.get` and `$.state.set`
 * answer, observed with `claude plugin test` as a black box. The docs say only that the helpers
 * "call `$.state.get` and `$.state.set` for you" (plugins/mods/interface.md, "Define, read, and
 * write a value"), not what either answers. Each value has a version: `get` answers `{ version: 0 }`
 * while nothing was written and `{ value, version }` after; `set` answers `{ isSet, version }` and,
 * given `{ ifVersion }` of another version, writes nothing. A family's member (`memberOf`) is a value
 * of its own under `id`.
 */
import { describe, expect, test } from 'bun:test';
import { atom, derive, update } from '../../../src/mods/api/index.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { rejection } from '../../support/rejection.ts';

const REF = { plugin: 'probe', key: 'count' };

describe('$.state versions (oracle 2.1.322)', () => {
  test('get answers the version; set answers whether it wrote; a stale ifVersion writes nothing', async () => {
    const { api } = await apiHarness();
    expect(await api.state.get(REF)).toEqual({ version: 0 });
    expect(await api.state.set(REF, 7)).toEqual({ isSet: true, version: 1 });
    expect(await api.state.get(REF)).toEqual({ value: 7, version: 1 });
    expect(await api.state.set(REF, 8, { ifVersion: 0 })).toEqual({ isSet: false, version: 1 });
    expect(await api.state.get(REF)).toEqual({ value: 7, version: 1 });
    expect(await api.state.set(REF, 9, { ifVersion: 1 })).toEqual({ isSet: true, version: 2 });
  });

  test('a member under id is a value of its own', async () => {
    const { api } = await apiHarness();
    await api.state.set(REF, 1);
    await api.state.set({ ...REF, id: 'r1' }, 6);
    expect(await api.state.get({ ...REF, id: 'r1' })).toEqual({ value: 6, version: 1 });
    expect(await api.state.get(REF)).toEqual({ value: 1, version: 1 });
  });

  test('a value that is not a reference is refused, a derived value given to update among them', async () => {
    const { api } = await apiHarness();
    const NOT_A_REF =
      "my-mod: $.state.get takes a reference { plugin, key } (and id for a family's member)";
    expect(await rejection(api.state.get({ plugin: 'probe' }))).toBe(NOT_A_REF);
    const total = derive([atom(REF, 1)], (n) => n * 2);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a JavaScript module can pass a derived value
    expect(await rejection(update(api, total as never, (n) => n))).toBe(NOT_A_REF);
  });
});
