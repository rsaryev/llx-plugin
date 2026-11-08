/**
 * plugins/host-marketplace.md § Migrate users with a renames map (the example map; "run `claude
 * plugin validate .` ... It rejects a chain that cycles or that ends anywhere other than `null` or
 * a name in `plugins`, with `renames.<name>: chain does not resolve"; "Claude Code follows the
 * chain from the oldest name") and plugins/marketplace-reference.md § Validation messages (the two
 * `renames.<old>` rows). The rule is checked by `validateRenames` and reaches `claude plugin
 * validate` through `validateMarketplace`; a marketplace that loads is not rejected for it (a kit
 * judgment, tested outside `spec(...)`).
 * Cases the docs do not decide (which name stops a chain, the wording of the reason) are outside
 * `spec(...)` and in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import {
  readMarketplace,
  validateMarketplace,
} from '../../../src/format/marketplace/marketplace.ts';
import { validateRenames } from '../../../src/format/marketplace/renames.ts';
import { errorsOf, recordingEntryReader, withFields } from '../../support/marketplace-fixtures.ts';
import { spec } from '../../support/spec.ts';

const PREFIX = 'chain does not resolve (';
const SUFFIX = ') — target must be a name in plugins[], a key in renames, or null';

/** The documented example: `formatter` became `code-formatter`, `legacy-linter` was removed. */
const DOC_RENAMES = { formatter: 'code-formatter', 'legacy-linter': null };

spec('marketplace.field.renames', () => {
  test('the documented example map resolves: a current name and null are both valid ends', () => {
    expect(validateRenames(DOC_RENAMES, ['code-formatter'])).toEqual([]);
  });

  test('a chain that cycles is rejected on the key it starts from', () => {
    const found = validateRenames({ a: 'b', b: 'a' }, ['other']);
    expect(found.map((one) => one.path)).toEqual(['renames.a', 'renames.b']);
    for (const one of found) {
      expect(one.severity).toBe('error');
      expect(one.message.startsWith(PREFIX)).toBe(true);
      expect(one.message.endsWith(SUFFIX)).toBe(true);
    }
  });

  test('a name that renames to itself is a cycle unless it is still a plugin', () => {
    expect(validateRenames({ a: 'a' }, [])).toHaveLength(1);
    expect(validateRenames({ a: 'a' }, ['a'])).toEqual([]);
  });

  test('a chain that ends at a name that is neither in plugins nor a key is rejected', () => {
    const found = validateRenames({ formatter: 'code-formatter' }, ['something-else']);
    expect(found).toHaveLength(1);
    expect(found[0]?.path).toBe('renames.formatter');
    expect(found[0]?.message).toContain('chain does not resolve');
  });

  test('a chain is followed from the oldest name through every key to a plugin', () => {
    const renames = { v1: 'v2', v2: 'v3', v3: 'tool' };
    expect(validateRenames(renames, ['tool'])).toEqual([]);
    expect(validateRenames(renames, ['elsewhere']).map((one) => one.path)).toEqual([
      'renames.v1',
      'renames.v2',
      'renames.v3',
    ]);
  });

  test('a chain may end at null after any number of steps', () => {
    expect(validateRenames({ a: 'b', b: 'c', c: null }, [])).toEqual([]);
  });

  test('a target that is not a valid plugin name is rejected with the PluginIdSchema message', () => {
    for (const bad of ['has space', '-leading', 'a/b', '']) {
      const found = validateRenames({ old: bad }, ['x']);
      expect(found).toHaveLength(1);
      expect(found[0]).toEqual({
        severity: 'error',
        path: 'renames.old',
        message: `target "${bad}" is not a valid plugin name (PluginIdSchema)`,
      });
    }
  });

  test('claude plugin validate reports a chain that does not resolve', () => {
    const raw = withFields({ renames: { formatter: 'missing' } });
    const issues = validateMarketplace(raw, {}, recordingEntryReader().read);
    expect(errorsOf(issues).map((one) => one.path)).toEqual(['renames.formatter']);
  });

  test('the documented marketplace file with its renames map validates clean', () => {
    const raw = withFields({
      name: 'your-marketplace',
      plugins: [{ name: 'code-formatter', source: './plugins/code-formatter' }],
      renames: DOC_RENAMES,
    });
    expect(errorsOf(validateMarketplace(raw, {}, recordingEntryReader().read))).toEqual([]);
  });
});

describe('what the docs leave open (spec/judgments.md)', () => {
  test('a chain that does not resolve is checked only by validate: the marketplace still loads', () => {
    const raw = withFields({ renames: { formatter: 'missing' } });
    const loaded = readMarketplace(raw, {}, recordingEntryReader().read);
    expect(loaded.marketplace?.renames).toEqual({ formatter: 'missing' });
    expect(errorsOf(loaded.issues)).toEqual([]);
  });

  test('a name that is still a plugin ends a chain, even when it is also a key', () => {
    expect(validateRenames({ a: 'b', b: 'a' }, ['b'])).toEqual([]);
  });

  test('an unresolved chain names the reason: where it ended, or the cycle', () => {
    expect(validateRenames({ a: 'gone' }, [])[0]?.message).toContain('ends at "gone"');
    expect(validateRenames({ a: 'b', b: 'a' }, [])[0]?.message).toContain('a -> b -> a');
  });

  test('keys that name object members are plain names, never inherited ones', () => {
    // `fromEntries` defines `__proto__` as a key, as parsed JSON does.
    const entries: [string, string | null][] = [
      ['a', 'constructor'],
      ['__proto__', null],
    ];
    const renames = Object.fromEntries(entries);
    expect(validateRenames(renames, [])).toHaveLength(1);
  });

  test('a plugin that is dropped from validation as invalid is still a name in plugins[]', () => {
    const raw = withFields({ plugins: [{ name: 'bad', source: './x' }], renames: { a: 'bad' } });
    const issues = validateMarketplace(raw, {}, recordingEntryReader().read);
    expect(issues.map((one) => one.path)).not.toContain('renames.a');
  });
});
