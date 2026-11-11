/**
 * What a Claude Code 2.1.322 SESSION registers from a plugin, against the kit's session (E5a;
 * docs/TESTING.md, "Runtime oracle"; docs/SPEC.md, "Where Claude Code differs from its docs"). Each
 * folder of tests/fixtures/runtime is a plugin of its own; its `expected.json` is what the oracle
 * (`claude -p` and the `init` event, `bun run oracle:runtime`) registered, ids only, so this test
 * needs no `claude`. A field the kit gives differently on purpose is in `judgments.json` with the
 * row of spec/judgments.md. Outside `spec(...)`: an oracle result is never compatibility.
 */
import { describe, expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { kitRegistry } from '../../scripts/oracle/kit-registry.ts';
import {
  compareRegistries,
  FIXTURES_DIR,
  readExpected,
  readJudgments,
} from '../../scripts/oracle/registry-diff.ts';

const cases = readdirSync(FIXTURES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .toSorted();

describe('the kit registers what Claude Code registers', () => {
  test('there are fixtures, each with an expectation', async () => {
    expect(cases.length).toBeGreaterThan(20);
    for (const name of cases) {
      expect(await readExpected(join(FIXTURES_DIR, name))).toBeDefined();
    }
  });

  test.each(cases)('%s', async (name) => {
    const dir = join(FIXTURES_DIR, name);
    const expected = await readExpected(dir);
    if (expected === undefined) throw new Error(`${name} has no expected.json`);
    const verdicts = compareRegistries(
      name,
      await kitRegistry(dir),
      expected,
      await readJudgments(),
    );
    expect(verdicts.filter((one) => one.status === 'differs')).toEqual([]);
  });
});
