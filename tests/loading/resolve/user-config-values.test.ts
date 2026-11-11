/**
 * plugins/manifest-reference.md § User configuration (the field table: `type`, `title`, `required`,
 * `default`, `options`, `multiple`, `sensitive`, `min` / `max`), § Limit a field to fixed options,
 * § Where values are stored, § Reference a saved value ("In skill and agent content, only
 * non-sensitive values are substituted, and a sensitive value there becomes a placeholder";
 * `CLAUDE_PLUGIN_OPTION_<KEY>` is exported "for every option"). `validateUserConfigValues` tells
 * whether a saved value would be accepted; the dialog itself is the host's.
 */
import { describe, expect, test } from 'bun:test';
import {
  SENSITIVE_PLACEHOLDER,
  substituteContent,
  validateUserConfigValues,
  type ResolvedUserConfig,
  type SubstitutionScope,
} from '../../../src/entry/loading.ts';
import type { UserConfigOption } from '../../../src/format/index.ts';
import { fakeEnvironment, locations } from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';
import { optionEnvironment, userConfigValue } from '../../../src/loading/resolve/user-config.ts';

const base = { type: 'string', title: 'Label', description: 'Help' } as const;
const option = (fields: Partial<UserConfigOption>): UserConfigOption => ({ ...base, ...fields });
const configOf = (
  declared: UserConfigOption,
  values: ResolvedUserConfig['values'] = {},
): ResolvedUserConfig => ({ declared: { key: declared }, values });
const problems = (declared: UserConfigOption, values?: ResolvedUserConfig['values']): string[] =>
  validateUserConfigValues(configOf(declared, values)).map((found) => found.message);

spec('userConfig.field.type', () => {
  test('a string, directory or file takes a string, a number a number, a boolean a boolean', () => {
    for (const type of ['string', 'directory', 'file'] as const) {
      expect(problems(option({ type }), { key: '/x' })).toEqual([]);
      expect(problems(option({ type }), { key: 3 })).toEqual([
        `"Label" expects a ${type}, not number`,
      ]);
    }
    expect(problems(option({ type: 'number' }), { key: 3 })).toEqual([]);
    expect(problems(option({ type: 'number' }), { key: '3' })).toEqual([
      '"Label" expects a number, not string',
    ]);
    expect(problems(option({ type: 'number' }), { key: Number.NaN })).toHaveLength(1);
    expect(problems(option({ type: 'boolean' }), { key: false })).toEqual([]);
    expect(problems(option({ type: 'boolean' }), { key: 'false' })).toHaveLength(1);
  });
});

spec('userConfig.field.title', () => {
  test('the title is the label the user sees, so a problem names the option by it', () => {
    const found = validateUserConfigValues(
      configOf(option({ title: 'API token', type: 'number' }), { key: 'x' }),
    );
    expect(found).toEqual([
      expect.objectContaining({
        path: 'userConfig.key',
        message: '"API token" expects a number, not string',
      }),
    ]);
  });
});

spec('userConfig.field.required', () => {
  test('a required option does not accept an empty value: nothing, an empty string or an empty list', () => {
    for (const values of [{}, { key: '' }, { key: [] }]) {
      const multiple = Array.isArray(values.key);
      expect(problems(option({ required: true, multiple }), values)).toEqual([
        '"Label" is required and cannot be empty',
      ]);
    }
  });

  test('a value fills it, and zero and false are not empty', () => {
    expect(problems(option({ required: true }), { key: 'x' })).toEqual([]);
    expect(problems(option({ required: true, type: 'number' }), { key: 0 })).toEqual([]);
    expect(problems(option({ required: true, type: 'boolean' }), { key: false })).toEqual([]);
  });

  test('a default is the value when the user provides nothing, so it fills a required option', () => {
    expect(problems(option({ required: true, default: 'eu' }))).toEqual([]);
  });

  test('an option that is not required (or required false) accepts nothing at all', () => {
    expect(problems(option({}))).toEqual([]);
    expect(problems(option({ required: false }), { key: '' })).toEqual([]);
  });
});

spec('userConfig.field.min', () => {
  test('a number below the minimum is refused, the minimum itself is not', () => {
    const number = option({ type: 'number', min: 2 });
    expect(problems(number, { key: 1 })).toEqual(['"Label" is below the minimum 2']);
    expect(problems(number, { key: 2 })).toEqual([]);
    expect(problems(number, { key: 100 })).toEqual([]);
  });
});

spec('userConfig.field.max', () => {
  test('a number above the maximum is refused, the maximum itself is not', () => {
    const number = option({ type: 'number', max: 10 });
    expect(problems(number, { key: 11 })).toEqual(['"Label" is above the maximum 10']);
    expect(problems(number, { key: 10 })).toEqual([]);
    expect(problems(number, { key: -5 })).toEqual([]);
  });
});

spec('userConfig.field.multiple', () => {
  test('a multiple string field takes an array of strings and not a single string or other items', () => {
    const list = option({ multiple: true });
    expect(problems(list, { key: ['a', 'b'] })).toEqual([]);
    expect(problems(list, { key: 'a' })).toEqual([
      '"Label" expects an array of strings (multiple), not string',
    ]);
    expect(problems(list, { key: 3 })).toHaveLength(1);
  });

  test('a field that is not multiple does not take an array', () => {
    expect(problems(option({}), { key: ['a'] })).toEqual(['"Label" expects a string, not object']);
  });
});

spec('userConfig.field.options', () => {
  test('the field accepts only the listed values', () => {
    const tone = option({ options: ['neutral', 'warm'], default: 'neutral' });
    expect(problems(tone, { key: 'warm' })).toEqual([]);
    expect(problems(tone, { key: 'loud' })).toEqual([
      '"Label" is not one of the options: neutral, warm',
    ]);
    expect(problems(tone)).toEqual([]);
  });
});

spec('userConfig.field.default', () => {
  test('the default is the value when the user provides nothing, and a saved value wins', () => {
    const config = configOf(option({ default: 'neutral' }));
    expect(userConfigValue(config, 'key')).toBe('neutral');
    expect(userConfigValue({ ...config, values: { key: 'warm' } }, 'key')).toBe('warm');
    expect(userConfigValue({ ...config, values: { key: '' } }, 'key')).toBe('');
  });

  test('a default of the wrong type is a problem like any other value', () => {
    expect(problems(option({ type: 'number', default: 'x' }))).toEqual([
      '"Label" expects a number, not string',
    ]);
  });
});

spec('userConfig.field.sensitive', () => {
  const secret = option({ sensitive: true, title: 'API token' });
  const scope: SubstitutionScope = {
    pluginId: 'p@m',
    locations: locations(),
    environment: fakeEnvironment({}),
    userConfig: {
      declared: { api_token: secret, region: option({}) },
      values: { api_token: 's3cret', region: 'eu' },
    },
    windows: false,
  };

  test('in skill and agent content a sensitive value becomes a placeholder and a plain one is substituted', async () => {
    const { text } = await substituteContent(
      '${user_config.api_token} ${user_config.region}',
      scope,
    );
    expect(text).toBe(`${SENSITIVE_PLACEHOLDER('api_token')} eu`);
    expect(text).not.toContain('s3cret');
  });

  test('it is still exported to hook processes: CLAUDE_PLUGIN_OPTION_<KEY> holds every option', () => {
    expect(optionEnvironment(scope.userConfig)).toEqual({
      CLAUDE_PLUGIN_OPTION_API_TOKEN: 's3cret',
      CLAUDE_PLUGIN_OPTION_REGION: 'eu',
    });
  });

  test('an option that is not marked sensitive is never masked', async () => {
    const plain = {
      ...scope,
      userConfig: { ...scope.userConfig, declared: { api_token: option({}) } },
    };
    expect((await substituteContent('${user_config.api_token}', plain)).text).toBe('s3cret');
  });
});

describe('judgments (spec/judgments.md)', () => {
  test('a value for a key nobody declared is not checked, and the checked value is the saved one else the default', () => {
    const config: ResolvedUserConfig = {
      declared: { port: option({ type: 'number', min: 1024, default: 80 }) },
      values: { other: 'x' },
    };
    expect(validateUserConfigValues(config).map((found) => found.path)).toEqual([
      'userConfig.port',
    ]);
    expect(validateUserConfigValues({ ...config, values: { port: 8080 } })).toEqual([]);
  });
});
