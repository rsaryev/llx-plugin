/**
 * plugins/manifest-reference.md § `name`: a name may not hold "a control character or a
 * bidirectional-formatting character". The loader and the validator share one class for it
 * (`CONTROL_OR_BIDI`): C0 and C1 controls and every Bidi_Control mark, LRM, RLM and ALM included.
 */
import { expect, test } from 'bun:test';
import { readManifest } from '../../src/format/manifest.ts';
import { CONTROL_OR_BIDI } from '../../src/format/names.ts';
import { spec } from '../support/spec.ts';

spec('manifest.field.name', () => {
  test('a C1 control or an LRM, RLM or ALM mark keeps the plugin from loading', () => {
    for (const code of [0x85, 0x9b, 0x200e, 0x200f, 0x061c, 0x202e, 0x2066, 0x07]) {
      const name = `a${String.fromCharCode(code)}b`;
      expect(readManifest({ name }).manifest, code.toString(16)).toBeUndefined();
      expect(CONTROL_OR_BIDI.test(name)).toBe(true);
    }
    expect(readManifest({ name: 'plain-name' }).manifest?.name).toBe('plain-name');
  });
});
