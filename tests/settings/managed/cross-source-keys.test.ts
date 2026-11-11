/**
 * managed-settings.md § Keys read from every admin source: the locks, the denials and the keys read
 * from the highest admin source, under both the default `"first-wins"` and `"merge"`; the cap, the
 * commit-trailer opt-out and the lock note are in `cross-source-rules.test.ts`. The requirement ids of the section follow the first key of
 * each bullet, so a key that is not first of its bullet is proven under the section's id (or the
 * id of its bullet) with a positive case, a negative case (an unselected source without the key, the
 * user-writable HKCU registry left out) and the combination rule the docs give.
 */
import { describe, expect, test } from 'bun:test';
import type { Settings } from '../../../src/protocol/official.ts';
import { valueAt, withValueAt } from '../../../src/settings/paths.ts';
import { policyOf } from '../../support/managed.ts';
import { spec } from '../../support/spec.ts';

const CROSS = 'settingsMerge.managed.Keys read from every admin source';
const MERGE = { managedSourcesBehavior: 'merge' } as const;

/** The settings holding `value` at the dotted `path`. */
const holding = (path: string, value: unknown): Settings => withValueAt({}, path, value);
const read = (settings: Settings, path: string): unknown => valueAt(settings, path);

/** What `held` composes to under each setting: the key is read the same way under both. */
function underBoth(held: Parameters<typeof policyOf>[0]): readonly Settings[] {
  const merging = { ...held, remote: { ...(held.remote ?? { model: 'selected' }), ...MERGE } };
  return [policyOf(held), policyOf(merging)];
}

/** The locks: "a `true` in any admin source turns the lock on". */
const LOCKS = [
  'sandbox.network.allowManagedDomainsOnly',
  'sandbox.filesystem.allowManagedReadPathsOnly',
  'sandbox.network.strictAllowlist',
  'allowManagedMcpServersOnly',
  'disableClaudeAiConnectors',
  'forceRemoteSettingsRefresh',
] as const;

/** The behaviors a `false` turns off: "each key can only deny". */
const DENIALS = [
  'useAutoModeDuringPlan',
  'syncClaudeAiSkills',
  'syncClaudeAiPlugins',
  'enableArtifact',
] as const;

/** Keys read from the highest admin source that sets them, each with two distinct values. */
const FROM_HIGHEST: readonly (readonly [path: string, high: unknown, low: unknown])[] = [
  ['sandbox.bwrapPath', '/usr/bin/bwrap-high', '/usr/bin/bwrap-low'],
  ['sandbox.socatPath', '/usr/bin/socat-high', '/usr/bin/socat-low'],
  ['sandbox.ripgrep', { command: '/usr/bin/rg' }, { command: '/opt/rg', args: ['--low'] }],
];

spec(
  [CROSS, 'policy.server.Per-key exceptions across managed sources.Cross-source lock keys'],
  () => {
    describe.each(LOCKS)('%s: a true in any admin source turns it on', (path) => {
      test('a lower admin source supplies it when the selected source does not', () => {
        for (const settings of underBoth({ remote: { model: 'a' }, file: holding(path, true) }))
          expect(read(settings, path)).toBe(true);
      });

      test('a true wins over a false in another admin source, whichever ranks higher', () => {
        for (const [high, low] of [
          [false, true],
          [true, false],
        ] as const)
          expect(
            read(
              policyOf({
                remote: { model: 'a', ...holding(path, high) },
                file: holding(path, low),
              }),
              path,
            ),
          ).toBe(true);
      });

      test('an unselected source without the key sets nothing, and a lower false is not a lock', () => {
        expect(
          read(policyOf({ remote: { model: 'a' }, file: { model: 'b' } }), path),
        ).toBeUndefined();
        expect(
          read(policyOf({ remote: { model: 'a' }, file: holding(path, false) }), path),
        ).toBeUndefined();
      });

      test('the HKCU registry is left out of the scan', () => {
        expect(
          read(policyOf({ file: { model: 'a' }, hkcu: holding(path, true) }), path),
        ).toBeUndefined();
      });
    });

    describe.each(DENIALS)('%s: a false in any admin source turns it off', (path) => {
      test('a lower admin source supplies the false when the selected source does not', () => {
        for (const settings of underBoth({ remote: { model: 'a' }, file: holding(path, false) }))
          expect(read(settings, path)).toBe(false);
      });

      test('a false wins over a true in another admin source, whichever ranks higher', () => {
        for (const [high, low] of [
          [true, false],
          [false, true],
        ] as const)
          expect(
            read(
              policyOf({
                remote: { model: 'a', ...holding(path, high) },
                file: holding(path, low),
              }),
              path,
            ),
          ).toBe(false);
      });

      test('it can only deny: a lower true turns nothing on, an unselected source without the key sets nothing', () => {
        expect(
          read(policyOf({ remote: { model: 'a' }, file: holding(path, true) }), path),
        ).toBeUndefined();
        expect(
          read(policyOf({ remote: { model: 'a' }, file: { model: 'b' } }), path),
        ).toBeUndefined();
      });

      test('the HKCU registry is left out of the scan', () => {
        expect(
          read(policyOf({ file: { model: 'a' }, hkcu: holding(path, false) }), path),
        ).toBeUndefined();
      });
    });

    describe.each(FROM_HIGHEST)('%s: read from every admin source', (path, high, low) => {
      test('the highest admin source that sets it supplies it, however many rank below', () => {
        const all = {
          remote: { model: 'a', ...holding(path, high) },
          plist: holding(path, low),
          file: holding(path, 'ignored'),
        };
        expect(read(policyOf(all), path)).toEqual(high);
        expect(
          read(
            policyOf({
              remote: { model: 'a' },
              plist: holding(path, low),
              file: holding(path, high),
            }),
            path,
          ),
        ).toEqual(low);
      });

      test('a lower admin source supplies it when the selected source does not, under both settings', () => {
        for (const settings of underBoth({ remote: { model: 'a' }, file: holding(path, low) }))
          expect(read(settings, path)).toEqual(low);
      });

      test('an unselected source without the key and the HKCU registry supply nothing', () => {
        expect(
          read(policyOf({ remote: { model: 'a' }, file: { model: 'b' } }), path),
        ).toBeUndefined();
        expect(
          read(policyOf({ file: { model: 'a' }, hkcu: holding(path, high) }), path),
        ).toBeUndefined();
      });
    });
  },
);
