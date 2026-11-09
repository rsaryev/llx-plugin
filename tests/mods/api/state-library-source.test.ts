/**
 * Judgment (spec/judgments.md, `src/mods/api/state-library-source.ts`): the JavaScript text a host
 * bundles behind `import { atom, read, update } from 'claude-code'` does what the kit's own
 * helpers do over the same `$.state` (plugins/mods/interface.md, "Define, read, and write a value").
 */
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atom, read, STATE_LIBRARY_SOURCE, update, type StateHost } from '../../../src/index.ts';

interface Helpers {
  readonly atom: typeof atom;
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

const stateOf = (values: Map<string, unknown>): StateHost => ({
  state: {
    get: (ref) => Promise.resolve(values.get(ref.key)),
    set: (ref, value) => Promise.resolve(values.set(ref.key, value)),
  },
});

describe('STATE_LIBRARY_SOURCE', () => {
  test('exports atom, read and update', async () => {
    expect(Object.keys(await evaluate()).toSorted()).toEqual(['atom', 'read', 'update']);
  });

  test('names a value, reads its default and updates it as the kit helpers do', async () => {
    const own = await evaluate();
    const key = { plugin: 'hello-tabs', key: 'count' };
    for (const helpers of [{ atom, read, update }, own]) {
      const values = new Map<string, unknown>();
      const $ = stateOf(values);
      const count = helpers.atom(key, 0);
      expect(count).toEqual({ plugin: 'hello-tabs', key: 'count', initial: 0 });
      expect(Object.isFrozen(count)).toBe(true);
      expect(await helpers.read($, count)).toBe(0);
      await helpers.update($, count, (value) => value + 1);
      await helpers.update($, count, (value) => value + 1);
      expect(await helpers.read($, count)).toBe(2);
      expect(values.get('count')).toBe(2);
    }
  });
});
