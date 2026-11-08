/**
 * managed-settings.md § Keys that fail closed (the `strictPluginOnlyCustomization` row): a value
 * that is neither a boolean nor an array is treated as `true`; an array entry this version does not
 * recognize locks nothing and a status note counts it.
 */
import { describe, expect, test } from 'bun:test';
import { readSurfaceLocks } from '../../../src/settings/customization/index.ts';
import { messagesOf, viewOf } from '../../support/key-classes.ts';
import { plain } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const ID = 'policy.managed.Keys that fail closed';
const managed = (raw: unknown) => viewOf(['managed', raw]);
const said = (raw: unknown) => messagesOf('managed', raw);
const hasMessage = (raw: unknown, part: string) =>
  said(raw).some((message) => message.includes(part));

spec(`${ID}.strictPluginOnlyCustomization`, () => {
  describe('a value that is neither a boolean nor an array is treated as true, locking all four surfaces', () => {
    for (const value of ['skills', 5, { skills: true }]) {
      test(JSON.stringify(value), () => {
        const raw = { strictPluginOnlyCustomization: value };
        expect(managed(raw).get('strictPluginOnlyCustomization')).toBe(true);
        expect(hasMessage(raw, 'was present but invalid')).toBe(true);
      });
    }
  });

  test('an array entry this version does not recognize locks nothing, and a status note counts it', () => {
    const raw = { strictPluginOnlyCustomization: ['skills', 'skils'] };
    // the managed list stays as written, so the customization policy can count the entry ...
    const list = plain(managed(raw).get('strictPluginOnlyCustomization'));
    expect(list).toEqual(['skills', 'skils']);
    // ... and what it locks is only the surface the entry names correctly
    const read = readSurfaceLocks(list);
    expect([...read.locked]).toEqual(['skills']);
    expect(read.unknownNames).toBe(1);
    // an array is a readable value: nothing is reported while the file is read
    expect(said(raw)).toEqual([]);
  });

  test('a list of only unrecognized entries locks nothing at all', () => {
    const read = readSurfaceLocks(
      plain(
        managed({ strictPluginOnlyCustomization: ['skils', 'hook'] }).get(
          'strictPluginOnlyCustomization',
        ),
      ),
    );
    expect(read.locked.size).toBe(0);
    expect(read.unknownNames).toBe(2);
  });
});
