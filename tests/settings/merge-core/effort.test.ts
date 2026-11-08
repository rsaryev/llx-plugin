/**
 * settings-reference.md § `effortLevel` ("one of `low`, `medium`, `high`, `xhigh`"), § `modelSettings`,
 * § `maxEffortLevel` ("When several scopes set a cap, the lowest applies"; "Per-model caps": a
 * model's entry "replaces this key for the model only within the settings source that sets both ...
 * Set `"max"` there to exempt the model from that source's cap; Claude Code still applies caps from
 * other sources"; the `medium` example that exempts Sonnet 4.6).
 */
import { describe, expect, test } from 'bun:test';
import { capEffort, effectiveCap, effortLevelFor } from '../../../src/settings/general/index.ts';
import { EFFORT_LEVELS, SAVED_EFFORT_LEVELS } from '../../../src/index.ts';
import { layerOf } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const SONNET = 'claude-sonnet-4-6';
const OPUS = 'claude-opus-5-5';
const DOCS_EXAMPLE = {
  maxEffortLevel: 'medium',
  modelSettings: { [SONNET]: { maxEffortLevel: 'max' } },
};

spec('settingsMerge.settings.Lists merge instead of overriding', () => {
  describe('a file saves low, medium, high or xhigh; max is only a cap', () => {
    test('a saved max is no level, top-level or per model, and the levels are the four of the docs', () => {
      expect(SAVED_EFFORT_LEVELS).toEqual(['low', 'medium', 'high', 'xhigh']);
      const facts = { model: OPUS, userLevelApplies: true };
      expect(effortLevelFor([layerOf('user', { effortLevel: 'max' })], facts)).toBeUndefined();
      const perModel = { modelSettings: { [OPUS]: { effortLevel: 'max' } } };
      expect(effortLevelFor([layerOf('user', perModel)], facts)).toBeUndefined();
      expect(effortLevelFor([layerOf('user', { effortLevel: 'xhigh' })], facts)?.level).toBe(
        'xhigh',
      );
    });
  });
});

spec('settingsMerge.settings.Exceptions to managed settings precedence.maxEffortLevel', () => {
  describe('the lowest cap applies; a model entry replaces the cap of its own source for that model', () => {
    test('the docs example: a medium cap for every model and Sonnet exempted by max', () => {
      const layers = [layerOf('user', DOCS_EXAMPLE)];
      expect(effectiveCap(layers, OPUS)).toBe('medium');
      expect(effectiveCap(layers, SONNET)).toBeUndefined();
    });

    test('the exemption covers the source that sets it only: another source still caps the model', () => {
      const layers = [
        layerOf('managed', { maxEffortLevel: 'high' }),
        layerOf('user', DOCS_EXAMPLE),
      ];
      expect(effectiveCap(layers, SONNET)).toBe('high');
      expect(effectiveCap(layers, OPUS)).toBe('medium');
    });

    test('a model cap replaces the top-level one of its source, raising or lowering it for that model', () => {
      const user = layerOf('user', {
        maxEffortLevel: 'low',
        modelSettings: { [OPUS]: { maxEffortLevel: 'high' } },
      });
      expect(effectiveCap([user], OPUS)).toBe('high');
      expect(effectiveCap([user], SONNET)).toBe('low');
      // A cap set in one scope can't be raised from another.
      expect(effectiveCap([user, layerOf('project', { maxEffortLevel: 'medium' })], OPUS)).toBe(
        'medium',
      );
    });

    test('a model cap alone caps that model only, and no cap or a max leaves it free', () => {
      const user = layerOf('user', { modelSettings: { [OPUS]: { maxEffortLevel: 'low' } } });
      expect(effectiveCap([user], OPUS)).toBe('low');
      expect(effectiveCap([user], SONNET)).toBeUndefined();
      expect(effectiveCap([layerOf('user', { maxEffortLevel: 'max' })], OPUS)).toBeUndefined();
      expect(effectiveCap([], OPUS)).toBeUndefined();
    });

    test('a --add-dir directory sets no cap', () => {
      expect(effectiveCap([layerOf('addDir', { maxEffortLevel: 'low' })], OPUS)).toBeUndefined();
    });

    test('a level above the cap runs at the cap, a lower one is kept, no cap changes nothing; max is the top of the ladder', () => {
      expect(capEffort('xhigh', 'medium')).toBe('medium');
      expect(capEffort('max', 'high')).toBe('high');
      expect(capEffort('low', 'medium')).toBe('low');
      expect(capEffort('max', undefined)).toBe('max');
      expect(EFFORT_LEVELS.at(-1)).toBe('max');
    });
  });
});

describe('the host', () => {
  test('applies the lower of the file cap and an organization limit with capEffort', () => {
    const fileCap = effectiveCap([layerOf('user', { maxEffortLevel: 'high' })], OPUS);
    const organizationLimit = 'medium';
    expect(capEffort(capEffort('xhigh', fileCap), organizationLimit)).toBe('medium');
  });
});
