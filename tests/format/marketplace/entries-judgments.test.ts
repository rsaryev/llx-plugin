/**
 * Judgments of the entry reader: what plugins/marketplace-reference.md and plugins/relevance.md
 * leave open (spec/judgments.md lists each). Tested outside `spec(...)`: a judgment never counts
 * toward compatibility.
 */
import { describe, expect, test } from 'bun:test';
import {
  loaded,
  rawEntry,
  readOne,
  readPlugins,
  validatePlugins,
} from '../../support/marketplace-entries.ts';
import { errorsOf } from '../../support/marketplace-fixtures.ts';

const manifests = (version: string) => ({ pluginManifests: new Map([[0, { version }]]) });
const relevance = (signals: unknown) => readOne(rawEntry({ relevance: { signals } }));

describe('judgment: an entry name that is empty', () => {
  test('is "Plugin must have a name", like the marketplace\'s own, and drops the entry', () => {
    const { entry, issues } = readOne(rawEntry({ name: '' }));
    expect(entry).toBeUndefined();
    expect(issues).toEqual([
      { severity: 'error', path: 'plugins[0].name', message: 'Plugin must have a name' },
    ]);
  });
});

describe('judgment: which of two entries with one name loads', () => {
  test('the first keeps the name and every later one is dropped alone', () => {
    const result = readPlugins([
      rawEntry({ name: 'x', description: 'first' }),
      rawEntry({ name: 'x', description: 'second' }),
      rawEntry({ name: 'x', description: 'third' }),
    ]);
    expect(result.marketplace?.plugins.map((entry) => entry.description)).toEqual(['first']);
    expect(errorsOf(result.issues).map((found) => found.path)).toEqual([
      'plugins[1].name',
      'plugins[2].name',
    ]);
  });

  test('an entry dropped for another reason does not hold its name', () => {
    const result = readPlugins([rawEntry({ name: 'x', tags: 5 }), rawEntry({ name: 'x' })]);
    expect(result.marketplace?.plugins).toHaveLength(1);
    expect(errorsOf(result.issues).map((found) => found.path)).toEqual(['plugins[0].tags']);
  });
});

describe('judgment: the reserved-name check of an entry', () => {
  test("is the manifest's check without its kebab-case advice: capitals are a valid install id", () => {
    expect(validatePlugins([rawEntry({ name: 'MyPlugin' })])).toEqual([]);
  });

  test('is run when validating only', () => {
    expect(readPlugins([rawEntry({ name: 'anthropic-tools' })]).issues).toEqual([]);
    expect(errorsOf(validatePlugins([rawEntry({ name: 'anthropic-tools' })]))).toHaveLength(1);
  });
});

describe('judgment: the wording of a field of the wrong type', () => {
  test('is the validator\'s own "Invalid input: expected <type>, received <type>", at the field', () => {
    const { issues } = readOne(rawEntry({ tags: 'ci', category: 1, strict: 'no' }));
    expect(issues.map((found) => [found.path, found.message])).toEqual([
      ['plugins[0].category', 'Invalid input: expected string, received number'],
      ['plugins[0].tags', 'Invalid input: expected array, received string'],
      ['plugins[0].strict', 'Invalid input: expected boolean, received string'],
    ]);
  });
});

describe('judgment: the version warning', () => {
  test('names the plugin.json of a root-source entry inside .claude-plugin', () => {
    const entry = rawEntry({ source: '.', version: '1.0.0' });
    expect(readPlugins([entry], manifests('2.0.0')).issues[0]?.message).toBe(
      'Entry declares version "1.0.0" but ./.claude-plugin/plugin.json says "2.0.0". At install time, plugin.json wins',
    );
  });

  test('is a warning: the entry keeps its version and loads', () => {
    const result = readPlugins([rawEntry({ version: '1.0.0' })], manifests('2.0.0'));
    expect(result.marketplace?.plugins).toHaveLength(1);
  });
});

describe('judgment: relevance beyond the quoted limits', () => {
  test('a host with capitals is not rejected: only a scheme, port or path is', () => {
    expect(relevance({ hosts: ['Registry.Terraform.IO'] }).issues).toEqual([]);
  });

  test("a manifestDeps pattern is not compiled: an invalid expression is the host's to report", () => {
    expect(relevance({ manifestDeps: [{ file: '(', pattern: '[' }] }).issues).toEqual([]);
  });

  test('a signals value that is not an object invalidates the entry (it is not the quoted relevance warning)', () => {
    const { entry, issues } = relevance(['cli']);
    expect(entry).toBeUndefined();
    expect(errorsOf(issues).map((found) => found.path)).toEqual(['plugins[0].relevance.signals']);
  });
});

describe('judgment: carrying fields the contract has no named slot for', () => {
  test('settings, workflows, monitors, types and experimental are carried under components', () => {
    const entry = loaded(
      rawEntry({
        settings: { agent: 'reviewer' },
        workflows: './wf/',
        monitors: './monitors/monitors.json',
        types: './types.d.ts',
      }),
    );
    expect(entry.components.settings).toEqual({ agent: 'reviewer' });
    expect(entry.components.workflows).toBe('./wf/');
    expect(entry.components.monitors).toBe('./monitors/monitors.json');
    expect(entry.components.types).toBe('./types.d.ts');
  });

  test('$schema is accepted and dropped, like at the top level', () => {
    const { entry, issues } = readOne(rawEntry({ $schema: 'https://example.com/s.json' }));
    expect(issues).toEqual([]);
    expect(JSON.stringify(entry)).not.toContain('example.com');
  });
});

describe('an entry key that is a prototype member', () => {
  test('is an unknown field, never read as one', () => {
    const raw = JSON.parse(
      '{"name":"p","source":"./p","__proto__":{"strict":false},"constructor":1}',
    );
    const { entry, issues } = readOne(raw);
    expect(entry?.strict).toBe(true);
    expect(issues.map((found) => found.path).toSorted()).toEqual([
      'plugins[0].__proto__',
      'plugins[0].constructor',
    ]);
  });
});
