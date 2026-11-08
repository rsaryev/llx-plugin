/**
 * relevance.md § Field reference (`relevance`, `relevance.signals`, the limits and the paragraph on
 * older clients) and § Validate your marketplace; marketplace-reference.md § Validation messages
 * (the `'relevance' must be an object ...` and `Unknown field` rows).
 *
 * The kit owns the validated typed model of `relevance`. What Claude Code does with a signal (a
 * spinner tip, a Discover pin) is interface behaviour; no signal matching is claimed.
 */
import { describe, expect, test } from 'bun:test';
import { effectiveTopic } from '../../../src/format/marketplace/relevance.ts';
import { loaded, rawEntry, readOne } from '../../support/marketplace-entries.ts';
import { errorsOf } from '../../support/marketplace-fixtures.ts';
import { spec } from '../../support/spec.ts';

const withRelevance = (relevance: unknown) => readOne(rawEntry({ relevance }));
const signals = (value: Record<string, unknown>) => withRelevance({ signals: value });
const dep = (length: number) => ({ file: 'f'.repeat(length), pattern: 'p'.repeat(length) });
const strings = (count: number, length = 1) =>
  Array.from({ length: count }, () => 'a'.repeat(length));

spec('marketplace.entry.relevance', () => {
  test('the documented terraform example loads and is carried as written', () => {
    const relevance = {
      topic: 'Terraform',
      signals: { cli: ['terraform'], filesRead: ['**/*.tf'] },
    };
    const { entry, issues } = withRelevance(relevance);
    expect(issues).toEqual([]);
    expect(entry?.relevance).toEqual(relevance);
  });

  test('the documented manifestDeps example loads (both values are regular-expression sources)', () => {
    const relevance = {
      signals: {
        manifestDeps: [{ file: '[/\\\\]package\\.json$', pattern: '"your-sdk"\\s*:' }],
      },
    };
    const { entry, issues } = withRelevance(relevance);
    expect(issues).toEqual([]);
    expect(entry?.relevance).toEqual(relevance);
  });

  test('every signal field is carried: cwd, cli, hosts, filesRead and manifestDeps', () => {
    const full = {
      cwd: ['infra', 'infra/**'],
      cli: ['terraform'],
      hosts: ['registry.terraform.io'],
      filesRead: ['**/*.tf'],
      manifestDeps: [{ file: 'package\\.json$', pattern: 'sdk' }],
    };
    expect(
      loaded(rawEntry({ relevance: { topic: 'T', signals: full } })).relevance?.signals,
    ).toEqual(full);
  });

  test('a topic and signals are both optional', () => {
    for (const relevance of [{}, { topic: 'Only a topic' }, { signals: {} }]) {
      const { entry, issues } = withRelevance(relevance);
      expect(issues).toEqual([]);
      expect(entry?.relevance).toEqual(relevance);
    }
  });

  test('a value that is not an object gets the quoted warning, is dropped, and the entry loads', () => {
    const cases: [unknown, string][] = [
      ['Terraform', 'string'],
      [3, 'number'],
      [['topic'], 'array'],
      [null, 'null'],
    ];
    for (const [relevance, type] of cases) {
      const { entry, issues } = withRelevance(relevance);
      expect(issues).toEqual([
        {
          severity: 'warning',
          path: 'plugins[0].relevance',
          message: `'relevance' must be an object containing topic and signals; got ${type}. It will be ignored at load time.`,
        },
      ]);
      expect(entry?.relevance).toBeUndefined();
      expect(entry?.name).toBe('my-plugin');
    }
  });

  test('an unknown key under relevance or relevance.signals is a warning and is not carried', () => {
    const { entry, issues } = withRelevance({
      topic: 'T',
      colour: 'blue',
      signals: { cli: ['x'], proxies: ['y'] },
    });
    expect(issues).toEqual([
      {
        severity: 'warning',
        path: 'plugins[0].relevance.colour',
        message: "Unknown field 'colour'. Claude Code ignores it at load time.",
      },
      {
        severity: 'warning',
        path: 'plugins[0].relevance.signals.proxies',
        message: "Unknown field 'proxies'. Claude Code ignores it at load time.",
      },
    ]);
    expect(entry?.relevance).toEqual({ topic: 'T', signals: { cli: ['x'] } });
  });

  test('a topic of 64 characters is accepted; one of 65 invalidates the whole entry', () => {
    expect(withRelevance({ topic: 'a'.repeat(64) }).entry).toBeDefined();
    const over = withRelevance({ topic: 'a'.repeat(65) });
    expect(over.entry).toBeUndefined();
    expect(errorsOf(over.issues).map((found) => found.path)).toEqual([
      'plugins[0].relevance.topic',
    ]);
  });

  test('each signal accepts its documented limit and invalidates the entry one past it', () => {
    const limits: [string, number, number][] = [
      ['cwd', 10, 256],
      ['cli', 10, 64],
      ['filesRead', 10, 256],
    ];
    for (const [field, count, length] of limits) {
      expect(signals({ [field]: strings(count, length) }).entry).toBeDefined();
      const tooMany = signals({ [field]: strings(count + 1, length) });
      expect(tooMany.entry).toBeUndefined();
      expect(errorsOf(tooMany.issues).map((found) => found.path)).toEqual([
        `plugins[0].relevance.signals.${field}`,
      ]);
      const tooLong = signals({ [field]: strings(1, length + 1) });
      expect(tooLong.entry).toBeUndefined();
      expect(errorsOf(tooLong.issues).map((found) => found.path)).toEqual([
        `plugins[0].relevance.signals.${field}[0]`,
      ]);
    }
  });

  test('hosts take 20 entries of 128 characters', () => {
    expect(signals({ hosts: strings(20, 128) }).entry).toBeDefined();
    expect(signals({ hosts: strings(21, 128) }).entry).toBeUndefined();
    expect(signals({ hosts: strings(1, 129) }).entry).toBeUndefined();
  });

  test('manifestDeps take 10 entries whose file and pattern are at most 256 characters', () => {
    expect(
      signals({ manifestDeps: Array.from({ length: 10 }, () => dep(256)) }).entry,
    ).toBeDefined();
    expect(
      signals({ manifestDeps: Array.from({ length: 11 }, () => dep(1)) }).entry,
    ).toBeUndefined();
    const long = signals({ manifestDeps: [{ file: 'f'.repeat(257), pattern: 'p' }] });
    expect(errorsOf(long.issues).map((found) => found.path)).toEqual([
      'plugins[0].relevance.signals.manifestDeps[0].file',
    ]);
    const missing = signals({ manifestDeps: [{ file: 'f' }] });
    expect(missing.entry).toBeUndefined();
  });

  test('a hosts entry with a scheme, a port or a path is rejected; a bare hostname is not', () => {
    for (const host of [
      'https://registry.terraform.io',
      'registry.terraform.io:443',
      'registry.terraform.io/v1',
      'http://a',
    ]) {
      const { entry, issues } = signals({ hosts: [host] });
      expect(entry).toBeUndefined();
      expect(errorsOf(issues).map((found) => found.path)).toEqual([
        'plugins[0].relevance.signals.hosts[0]',
      ]);
    }
    expect(signals({ hosts: ['registry.terraform.io', 'localhost'] }).issues).toEqual([]);
  });

  test('a recognized signal of the wrong type invalidates the entry', () => {
    for (const value of [
      { cli: 'terraform' },
      { cwd: [1] },
      { hosts: 'a.b' },
      { manifestDeps: ['x'] },
    ]) {
      expect(signals(value).entry).toBeUndefined();
    }
    expect(withRelevance({ signals: 'cli' }).entry).toBeUndefined();
    expect(withRelevance({ topic: 7 }).entry).toBeUndefined();
  });

  test('older clients load unknown fields: a marketplace with one still loads with the entry in it', () => {
    const { entry } = withRelevance({
      signals: { cli: ['x'], futureSignal: ['y'] },
      futureField: 1,
    });
    expect(entry?.relevance).toEqual({ signals: { cli: ['x'] } });
  });
});

spec('marketplace.entry.relevance', () => {
  test('the topic defaults to the plugin name with each hyphen segment capitalized', () => {
    const entry = loaded(rawEntry({ name: 'terraform-helpers' }));
    expect(effectiveTopic(entry)).toBe('Terraform Helpers');
    expect(effectiveTopic(loaded(rawEntry({ name: 'deploy' })))).toBe('Deploy');
  });

  test('a topic the entry sets is the one used', () => {
    const entry = loaded(
      rawEntry({ name: 'terraform-helpers', relevance: { topic: 'Terraform' } }),
    );
    expect(effectiveTopic(entry)).toBe('Terraform');
  });

  test('a relevance without a topic still gets the default', () => {
    const entry = loaded(rawEntry({ name: 'my-sdk', relevance: { signals: { cli: ['x'] } } }));
    expect(effectiveTopic(entry)).toBe('My Sdk');
  });
});

describe('relevance limits count UTF-16 code units, like a JavaScript string length', () => {
  // The docs say "characters" without defining them; recorded in spec/judgments.md.
  test('a topic of 32 emoji (64 code units) is accepted, 33 is over', () => {
    expect(withRelevance({ topic: '😀'.repeat(32) }).entry).toBeDefined();
    expect(withRelevance({ topic: '😀'.repeat(33) }).entry).toBeUndefined();
  });
});
