/**
 * plugins/manifest-reference.md § User configuration: keys are identifiers, each option is a
 * strict object, and an unknown key in one fails validation (§ Unrecognized fields: the plugin
 * does not load).
 */
import { describe, expect, test } from 'bun:test';
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

const tone: Record<string, unknown> = {
  ...base,
  options: ['neutral', 'warm', 'formal'],
  default: 'neutral',
};

spec(['userConfig.field.options', 'userConfig.rule.Limit a field to fixed options'], () => {
  test('the tone example (a string field with options and a default from them) loads and is kept', () => {
    expect(withOption(tone).manifest?.userConfig?.api_token).toMatchObject(tone);
  });

  test('each option is a plain label of 1 to 64 characters', () => {
    expect(
      withOption({ ...tone, options: ['x'.repeat(64)], default: 'x'.repeat(64) }).manifest,
    ).toBeDefined();
    expect(withOption({ ...tone, options: [''] }).manifest).toBeUndefined();
    expect(withOption({ ...tone, options: ['x'.repeat(65)] }).manifest).toBeUndefined();
  });

  test('applies only to a string field: a number, boolean, directory or file field with options fails to load', () => {
    for (const type of ['number', 'boolean', 'directory', 'file']) {
      const result = withOption({ ...tone, type });
      expect(result.manifest, type).toBeUndefined();
      expect(result.issues).toContainEqual(
        expect.objectContaining({ severity: 'error', path: 'userConfig.api_token' }),
      );
    }
  });

  test('applies to a string that is not multiple: options with multiple fails to load, and multiple false is fine', () => {
    expect(
      withOption({ ...tone, multiple: true, default: undefined, required: true }).manifest,
    ).toBeUndefined();
    expect(withOption({ ...tone, multiple: false }).manifest).toBeDefined();
  });

  test('applies to a string that is not sensitive: options with sensitive fails to load, and sensitive false is fine', () => {
    expect(withOption({ ...tone, sensitive: true }).manifest).toBeUndefined();
    expect(withOption({ ...tone, sensitive: false }).manifest).toBeDefined();
  });

  test('the default is one of the listed values: a default outside the list fails to load', () => {
    const result = withOption({ ...tone, default: 'loud' });
    expect(result.manifest).toBeUndefined();
    expect(result.issues[0]?.message).toContain('"default" must be one of the listed "options"');
    expect(withOption({ ...tone, default: ['neutral'] }).manifest).toBeUndefined();
  });

  test('without a default, required true makes the user pick one', () => {
    const { default: _, ...noDefault } = tone;
    expect(withOption({ ...noDefault, required: true }).manifest).toBeDefined();
  });

  test('the rules apply to the options of a channel too', () => {
    const channels = [{ server: 'chat', userConfig: { tone: { ...tone, type: 'number' } } }];
    expect(readManifest({ name: 'demo', channels }).manifest).toBeUndefined();
  });
});

test('an unknown key in an option fails, and the plugin does not load', () => {
  const result = withOption({ ...base, secret: true });
  expect(result.manifest).toBeUndefined();
  expect(result.issues).toContainEqual(
    expect.objectContaining({ severity: 'error', path: 'userConfig.api_token' }),
  );
});

describe('judgments (spec/judgments.md)', () => {
  test('options with neither a default from the list nor required true fail to load', () => {
    const { default: _, ...noDefault } = tone;
    expect(withOption({ ...noDefault, required: false }).manifest).toBeUndefined();
    expect(withOption(noDefault).manifest).toBeUndefined();
  });
});
