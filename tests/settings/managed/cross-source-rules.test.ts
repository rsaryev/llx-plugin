/**
 * managed-settings.md § Keys read from every admin source: the cap, the commit-trailer opt-out, the
 * lock note of `/status` and the read-path allowlist of the lock, under both settings of
 * `managedSourcesBehavior`. The other keys are in `cross-source-keys.test.ts`.
 */
import { describe, expect, test } from 'bun:test';
import type { Settings } from '../../../src/protocol/official.ts';
import { valueAt } from '../../../src/settings/paths.ts';
import { compose, policyOf } from '../../support/managed.ts';
import { spec } from '../../support/spec.ts';

const CROSS = 'settingsMerge.managed.Keys read from every admin source';
const MERGE = { managedSourcesBehavior: 'merge' } as const;

/** What `held` composes to under each setting: the key is read the same way under both. */
function underBoth(held: Parameters<typeof policyOf>[0]): readonly Settings[] {
  const merging = { ...held, remote: { ...(held.remote ?? { model: 'selected' }), ...MERGE } };
  return [policyOf(held), policyOf(merging)];
}

const read = (settings: Settings, path: string): unknown => valueAt(settings, path);

const filesystem = (allowRead: string[], lock?: boolean) => ({
  sandbox: {
    filesystem: { allowRead, ...(lock === undefined ? {} : { allowManagedReadPathsOnly: lock }) },
  },
});

const cap = (level: string) => ({ maxEffortLevel: level });

spec(CROSS, () => {
  describe('maxEffortLevel: the lowest cap in any admin source applies', () => {
    test('the lowest cap wins whichever source holds it', () => {
      expect(
        policyOf({ remote: { model: 'a', ...cap('high') }, file: cap('low') }).maxEffortLevel,
      ).toBe('low');
      expect(
        policyOf({ remote: { model: 'a', ...cap('low') }, file: cap('high') }).maxEffortLevel,
      ).toBe('low');
      expect(
        policyOf({ remote: cap('max'), plist: cap('medium'), file: cap('xhigh') }).maxEffortLevel,
      ).toBe('medium');
    });

    test('a lower admin source supplies the cap when the selected source sets none, under both settings', () => {
      for (const settings of underBoth({ remote: { model: 'a' }, file: cap('high') }))
        expect(settings.maxEffortLevel).toBe('high');
    });

    test('no cap in any admin source leaves none, and the HKCU registry is left out', () => {
      expect(
        policyOf({ remote: { model: 'a' }, file: { model: 'b' } }).maxEffortLevel,
      ).toBeUndefined();
      expect(policyOf({ file: { model: 'a' }, hkcu: cap('low') }).maxEffortLevel).toBeUndefined();
    });
  });

  describe('attribution and includeCoAuthoredBy: a commit-trailer opt-out from any admin source applies', () => {
    const trailer = { commit: 'Co-Authored-By: Claude', pr: 'Made with Claude' };
    const selected = { model: 'a', attribution: trailer };

    test('attribution: false opts out', () => {
      expect(policyOf({ remote: { model: 'a' }, file: { attribution: false } }).attribution).toBe(
        false,
      );
    });

    test('an empty attribution.commit opts out and leaves the rest of the selected attribution', () => {
      expect(
        policyOf({ remote: selected, file: { attribution: { commit: '' } } }).attribution,
      ).toEqual({
        commit: '',
        pr: trailer.pr,
      });
      expect(
        policyOf({ remote: { model: 'a' }, file: { attribution: { commit: '' } } }).attribution,
      ).toBe(false);
    });

    test('the deprecated includeCoAuthoredBy: false opts out', () => {
      expect(
        policyOf({ remote: { model: 'a' }, file: { includeCoAuthoredBy: false } }).attribution,
      ).toBe(false);
      expect(
        policyOf({ remote: selected, file: { includeCoAuthoredBy: false } }).attribution,
      ).toEqual({ commit: '', pr: trailer.pr });
    });

    test('the opt-out holds under both settings', () => {
      for (const settings of underBoth({ remote: selected, file: { attribution: false } }))
        expect(read(settings, 'attribution.commit')).toBe('');
    });

    test('a trailer that is not an opt-out changes nothing', () => {
      expect(
        policyOf({ remote: { model: 'a' }, file: { attribution: trailer } }).attribution,
      ).toBeUndefined();
      expect(
        policyOf({ remote: selected, file: { includeCoAuthoredBy: true } }).attribution,
      ).toEqual(trailer);
      expect(
        policyOf({ remote: selected, file: { attribution: { commit: 'Signed' } } }).attribution,
      ).toEqual(trailer);
      expect(
        policyOf({
          remote: { model: 'a' },
          file: { includeCoAuthoredBy: false, attribution: trailer },
        }).attribution,
      ).toBeUndefined();
    });

    test('the HKCU registry is left out of the scan', () => {
      expect(
        policyOf({ file: { model: 'a' }, hkcu: { attribution: false } }).attribution,
      ).toBeUndefined();
    });
  });

  describe('allowManagedMcpServersOnly: /status names a source whose lock is not the one in force', () => {
    test('a source that sets the lock to false beside another that sets it true is named', () => {
      const composed = compose({
        remote: { model: 'a', allowManagedMcpServersOnly: false },
        file: { allowManagedMcpServersOnly: true },
      });
      expect(composed.layer.settings.allowManagedMcpServersOnly).toBe(true);
      expect(composed.notInForce).toEqual([{ index: 0, key: 'allowManagedMcpServersOnly' }]);
    });

    test('a source whose lock is the one in force, or that does not set it, is not named', () => {
      for (const held of [
        {
          remote: { model: 'a', allowManagedMcpServersOnly: true },
          file: { allowManagedMcpServersOnly: true },
        },
        { remote: { model: 'a' }, file: { allowManagedMcpServersOnly: true } },
        { remote: { model: 'a' }, file: { model: 'b' } },
      ])
        expect(compose(held).notInForce).toEqual([]);
    });

    test('the HKCU registry is never named', () => {
      const composed = compose({
        file: { allowManagedMcpServersOnly: true },
        hkcu: { allowManagedMcpServersOnly: false },
      });
      expect(composed.notInForce).toEqual([]);
    });
  });
});

spec(`${CROSS}.sandbox.network.allowManagedDomainsOnly`, () => {
  test('allowManagedReadPathsOnly: while the lock is on, allowRead unions across every admin source', () => {
    for (const settings of underBoth({
      remote: { model: 'a', ...filesystem(['/remote']) },
      file: filesystem(['/file', '/remote'], true),
    }))
      expect(settings.sandbox?.filesystem?.allowRead).toEqual(['/remote', '/file']);
  });

  test('allowManagedReadPathsOnly: without the lock an unselected admin source allowRead is ignored', () => {
    const settings = policyOf({
      remote: { model: 'a', ...filesystem(['/remote']) },
      file: filesystem(['/file']),
    });
    expect(settings.sandbox?.filesystem?.allowRead).toEqual(['/remote']);
    const off = policyOf({
      remote: { model: 'a', ...filesystem(['/remote']) },
      file: filesystem(['/file'], false),
    });
    expect(off.sandbox?.filesystem?.allowRead).toEqual(['/remote']);
  });

  test('allowManagedReadPathsOnly: HKCU read paths are never part of the union', () => {
    const settings = policyOf({
      remote: { model: 'a', ...filesystem(['/remote'], true) },
      hkcu: filesystem(['/hkcu']),
    });
    expect(settings.sandbox?.filesystem?.allowRead).toEqual(['/remote']);
  });
});
