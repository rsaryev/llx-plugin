/**
 * plugins/manifest-reference.md § Reference a saved value: `CLAUDE_PLUGIN_OPTION_<KEY>` is exported
 * to hook processes for every option, with `<KEY>` uppercased (`api_token` is read as
 * `$CLAUDE_PLUGIN_OPTION_API_TOKEN`); § User configuration: `default` is the value used when the
 * user provides nothing. errors.md § plugin-command-references-user-config: the check runs on the
 * command template, so it fires even when no value is configured yet.
 * Outside `spec(...)`: no requirement id names these; the text of non-string values and which
 * options are exported are judgments (spec/judgments.md).
 */
import { describe, expect, test } from 'bun:test';
import {
  optionEnvName,
  referencesUserConfig,
  type ResolvedUserConfig,
} from '../../../src/loading/resolve/index.ts';
import {
  optionEnvironment,
  userConfigText,
  userConfigValue,
} from '../../../src/loading/resolve/user-config.ts';

const config: ResolvedUserConfig = {
  declared: {
    api_token: { type: 'string', title: 'T', description: 'd', sensitive: true },
    tone: { type: 'string', title: 'Tone', description: 'd', default: 'neutral' },
    retries: { type: 'number', title: 'R', description: 'd' },
    verbose: { type: 'boolean', title: 'V', description: 'd' },
    nothing: { type: 'string', title: 'N', description: 'd' },
  },
  values: { api_token: 'abc', retries: 0, verbose: false },
};

describe('CLAUDE_PLUGIN_OPTION_<KEY>', () => {
  test('the key is uppercased', () => {
    expect(optionEnvName('api_token')).toBe('CLAUDE_PLUGIN_OPTION_API_TOKEN');
    expect(optionEnvName('apiToken2')).toBe('CLAUDE_PLUGIN_OPTION_APITOKEN2');
  });
  test('every option with a value is exported, sensitive ones included; a default counts', () => {
    expect(optionEnvironment(config)).toEqual({
      CLAUDE_PLUGIN_OPTION_API_TOKEN: 'abc',
      CLAUDE_PLUGIN_OPTION_TONE: 'neutral',
      CLAUDE_PLUGIN_OPTION_RETRIES: '0',
      CLAUDE_PLUGIN_OPTION_VERBOSE: 'false',
    });
  });
  test('an option with neither a value nor a default is not exported', () => {
    expect(Object.keys(optionEnvironment(config))).not.toContain('CLAUDE_PLUGIN_OPTION_NOTHING');
  });
});

describe('the value of an option', () => {
  test('a saved value wins over the default, falsy values included', () => {
    expect(userConfigValue(config, 'retries')).toBe(0);
    expect(userConfigValue(config, 'verbose')).toBe(false);
    expect(userConfigValue(config, 'tone')).toBe('neutral');
    expect(userConfigValue({ ...config, values: { tone: 'warm' } }, 'tone')).toBe('warm');
  });
  test('an undeclared key has no value, even when the host supplied one', () => {
    expect(userConfigValue({ ...config, values: { ghost: 'x' } }, 'ghost')).toBeUndefined();
  });
  test('text of a value: strings as they are, numbers and booleans as text, lists joined by commas', () => {
    expect(userConfigText('a b')).toBe('a b');
    expect(userConfigText(2.5)).toBe('2.5');
    expect(userConfigText(true)).toBe('true');
    expect(userConfigText(['x', 'y'])).toBe('x,y');
  });
});

describe('referencesUserConfig', () => {
  test('runs on the template, so a value that is not configured changes nothing', () => {
    expect(referencesUserConfig('./scripts/notify.sh ${user_config.webhook_url}')).toBe(true);
  });
  test('only the `user_config.` form counts', () => {
    expect(referencesUserConfig('$CLAUDE_PLUGIN_OPTION_WEBHOOK_URL ${CLAUDE_PLUGIN_ROOT}')).toBe(
      false,
    );
    expect(referencesUserConfig('${user_config.}')).toBe(false);
    expect(referencesUserConfig('${user_config.2fa}')).toBe(false);
  });
});
