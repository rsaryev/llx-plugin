/**
 * What the merge core decides where the docs are silent (spec/judgments.md), and the parts of the
 * documented behaviour that have no requirement id of their own. Not under spec().
 */
import { describe, expect, test } from 'bun:test';
import { MERGES } from '../../../src/settings/merge.ts';
import { readClaudeJson } from '../../../src/settings/general/index.ts';
import { createGeneralView } from '../../support/settings-general.ts';
import { layerOf, issuesOf, plain } from '../../support/settings-layers.ts';

const entry = (name: string) => ({ [name]: 1 });

describe('the general merge rule', () => {
  test('objects in lists are one entry when they are the same JSON, the highest first', () => {
    const merged = MERGES.deepMerge.combine([
      { rules: [entry('a'), entry('b')] },
      { rules: [entry('b'), entry('c')] },
    ]);
    expect(merged).toEqual({ rules: [entry('a'), entry('b'), entry('c')] });
  });

  test('a list over a non-list, or a block over a scalar, is replaced by the highest value', () => {
    expect(MERGES.deepMerge.combine([{ k: 'text' }, { k: ['a'] }])).toEqual({ k: 'text' });
    expect(MERGES.deepMerge.combine([{ k: { a: 1 } }, { k: 5 }])).toEqual({ k: { a: 1 } });
  });

  test('a block key named __proto__ stays a key', () => {
    const above: unknown = JSON.parse('{"env":{"__proto__":"x"}}');
    const merged = createGeneralView([
      layerOf('user', above),
      layerOf('project', { env: { B: '1' } }),
    ]).get('env');
    expect(Object.keys(merged ?? {}).toSorted()).toEqual(['B', '__proto__']);
  });

  test('a key with no row is merged by the general rule in the merged settings, and a null value is no value', () => {
    const merged = createGeneralView([
      layerOf('user', { cleanupPeriodDays: 30, spinnerVerbs: ['a'] }),
      layerOf('project', { cleanupPeriodDays: 7, spinnerVerbs: ['b'] }),
      layerOf('local', { cleanupPeriodDays: null }),
    ]).merged();
    expect(plain(merged)).toEqual({ cleanupPeriodDays: 7, spinnerVerbs: ['b', 'a'] });
  });

  test('a --add-dir directory adds no key beyond the two it carries, in the merged settings too', () => {
    const merged = createGeneralView([
      layerOf('user', { model: 'opus' }),
      layerOf('addDir', { model: 'haiku', enabledPlugins: { 'a@m': true } }),
    ]).merged();
    expect(merged).toEqual({ model: 'opus', enabledPlugins: { 'a@m': true } });
  });
});

describe('the keys settings files carry', () => {
  test('the general keys read from the host parent settings like any file, beside managed settings', () => {
    expect(createGeneralView([layerOf('parent', { model: 'opus' })]).get('model')).toBe('opus');
  });

  test('a general key a scope may not carry is dropped with a warning naming it', () => {
    const issues = issuesOf('project', { allowManagedPermissionRulesOnly: true });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toBe('project:allowManagedPermissionRulesOnly');
  });
});

describe('the exceptions', () => {
  test('a value off the ladder is not honored and a lone project accept is no value', () => {
    const view = createGeneralView([
      layerOf('managed', { crossSessionInbound: 'hold' }),
      layerOf('project', { crossSessionInbound: 'maybe' }),
    ]);
    expect(view.get('crossSessionInbound')).toBe('hold');
  });

  test('a lone project accept is no value, and nor is one over a managed value that is not stricter', () => {
    const lone = createGeneralView([layerOf('project', { crossSessionInbound: 'accept' })]);
    expect(lone.get('crossSessionInbound')).toBeUndefined();
    const below = createGeneralView([
      layerOf('managed', { crossSessionInbound: 'hold' }),
      layerOf('project', { crossSessionInbound: 'accept' }),
    ]);
    expect(below.get('crossSessionInbound')).toBe('hold');
  });
});

describe('the host-facing details', () => {
  test('a blank ~/.claude.json with a backup that holds something is a configuration error, and no copy is made of a blank file with none', () => {
    const facts = { path: '/h/.claude.json', corruptedCopy: '/h/c', interactive: true } as const;
    expect(readClaudeJson({ ...facts, backup: '/h/b', text: '' })).toMatchObject({
      outcome: 'configuration-error',
    });
    expect(readClaudeJson({ ...facts, text: '' })).not.toHaveProperty('copyTo');
  });
});
