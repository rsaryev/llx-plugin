/**
 * plugins/manifest-reference.md § User configuration: keys are identifiers, each option is a
 * strict object, and an unknown key in one fails validation (§ Unrecognized fields: the plugin
 * does not load).
 */
import { expect, test } from 'bun:test';
import { readManifest } from '../../src/format/index.ts';
import { spec } from '../support/spec.ts';

const withOption = (option: Record<string, unknown>, key = 'api_token') =>
  readManifest({ name: 'demo', userConfig: { [key]: option } });
const base = { type: 'string', title: 'API token', description: 'Token for the API' } as const;

spec('manifest.field.userConfig', () => {
  test('an option with type, title and description loads', () => {
    expect(withOption(base).manifest?.userConfig).toEqual({ api_token: base });
  });
  test('keys are letters, digits and underscores, never starting with a digit', () => {
    expect(withOption(base, 'apiToken_2').manifest).toBeDefined();
    expect(withOption(base, '2fa').manifest).toBeUndefined();
    expect(withOption(base, 'api-token').manifest).toBeUndefined();
  });
});

for (const field of ['type', 'title', 'description'] as const) {
  spec(`userConfig.field.${field}`, () => {
    test('is required', () => {
      const { [field]: _dropped, ...rest } = base;
      expect(withOption(rest).manifest).toBeUndefined();
    });
  });
}

spec('userConfig.field.type', () => {
  test('is one of string, number, boolean, directory or file', () => {
    for (const type of ['string', 'number', 'boolean', 'directory', 'file']) {
      expect(withOption({ ...base, type }).manifest).toBeDefined();
    }
    expect(withOption({ ...base, type: 'secret' }).manifest).toBeUndefined();
  });
});

const OPTIONAL: readonly [field: string, value: unknown][] = [
  ['required', true],
  ['default', 'neutral'],
  ['options', ['neutral', 'warm', 'formal']],
  ['multiple', true],
  ['sensitive', true],
];
for (const [field, value] of OPTIONAL) {
  spec(`userConfig.field.${field}`, () => {
    test('is optional and kept', () => {
      expect(withOption({ ...base, [field]: value }).manifest?.userConfig?.api_token).toEqual({
        ...base,
        [field]: value,
      });
    });
  });
}

spec(['userConfig.field.min', 'userConfig.field.max'], () => {
  test('bound a number option', () => {
    const option = { ...base, type: 'number', min: 1, max: 10 } as const;
    expect(withOption(option).manifest?.userConfig?.api_token).toEqual(option);
  });
});

spec('userConfig.field.default', () => {
  test('is a string, number, boolean or array of strings', () => {
    for (const value of ['x', 3, false, ['a', 'b']]) {
      expect(withOption({ ...base, default: value }).manifest).toBeDefined();
    }
    expect(withOption({ ...base, default: { x: 1 } }).manifest).toBeUndefined();
  });
});

spec('userConfig.field.options', () => {
  test('each option is a plain label of 1 to 64 characters', () => {
    expect(withOption({ ...base, options: [''] }).manifest).toBeUndefined();
    expect(withOption({ ...base, options: ['x'.repeat(65)] }).manifest).toBeUndefined();
  });
});

test('an unknown key in an option fails, and the plugin does not load', () => {
  const result = withOption({ ...base, secret: true });
  expect(result.manifest).toBeUndefined();
  expect(result.issues).toContainEqual(
    expect.objectContaining({ severity: 'error', path: 'userConfig.api_token' }),
  );
});
