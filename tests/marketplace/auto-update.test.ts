/**
 * plugins/dependencies.md § Combine constraints from several plugins (auto-update fetches a
 * constrained dependency at the highest tag that satisfies every installed plugin's range; ranges
 * that do not overlap leave it at its current version; ranges that overlap with no tag in them
 * fetch the marketplace's current copy and skip the update when its `version` falls outside any
 * range). No requirement id covers the paragraph, so the tests are outside `spec(...)` and the
 * decision's shape is a row in spec/judgments.md.
 */
import { expect, test, describe } from 'bun:test';
import { autoUpdateDecision, releaseTag } from '../../src/marketplace/dependency-tags.ts';

const NAME = 'secrets-vault';
const dep = () => ({ name: NAME, marketplace: 'your-marketplace' });
const tags = (...versions: string[]) => versions.map((version) => releaseTag(NAME, version));

const decide = (ranges: string[], versions: string[], currentCopyVersion?: string) =>
  autoUpdateDecision({
    dep: dep(),
    ranges,
    tags: tags(...versions),
    ...(currentCopyVersion === undefined ? {} : { currentCopyVersion }),
  });

describe('auto-update (plugins/dependencies.md, "Combine constraints from several plugins")', () => {
  test('a tag in the overlap is installed', () => {
    expect(decide(['^2.0', '>=2.1'], ['2.0.0', '2.3.0', '3.0.0'], '3.0.0')).toEqual({
      outcome: 'update',
      via: 'tag',
      tag: 'secrets-vault--v2.3.0',
      version: '2.3.0',
    });
  });

  test('ranges that do not overlap leave the dependency where it is, with the conflict as the issue', () => {
    expect(decide(['~2.1', '~3.0'], ['2.1.0', '3.0.0'], '3.0.0')).toMatchObject({
      outcome: 'skip',
      reason: 'ranges-conflict',
      issue: { severity: 'error' },
    });
  });

  test('ranges that overlap with no tag in the overlap fetch the current copy when its version fits every range', () => {
    expect(decide(['^2.0', '>=2.1'], ['2.0.0', '3.0.0'], '2.5.0')).toEqual({
      outcome: 'update',
      via: 'current-copy',
      version: '2.5.0',
    });
  });

  test('the update is skipped when the current copy falls outside any installed plugin range', () => {
    expect(decide(['^2.0', '>=2.1'], ['2.0.0', '3.0.0'], '2.0.5')).toEqual({
      outcome: 'skip',
      reason: 'current-copy-out-of-range',
      version: '2.0.5',
    });
    expect(decide(['^2.0', '>=2.1'], ['2.0.0'], '3.0.0')).toMatchObject({
      outcome: 'skip',
      reason: 'current-copy-out-of-range',
    });
  });

  test('a current copy that states no version satisfies no range, so the update is skipped', () => {
    expect(decide(['^2.0'], [])).toEqual({
      outcome: 'skip',
      reason: 'current-copy-out-of-range',
    });
  });

  test('with no range there is nothing to check: the current copy is installed', () => {
    expect(decide([], ['1.0.0'], '1.0.0')).toEqual({
      outcome: 'update',
      via: 'current-copy',
      version: '1.0.0',
    });
  });
});
