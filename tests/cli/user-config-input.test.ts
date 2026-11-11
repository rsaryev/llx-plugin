/**
 * plugins/cli-reference.md § plugin install (`--config <key=value>`: "Set a `userConfig` option the
 * plugin's manifest declares"), § plugin configure ("Claude Code validates each value against the
 * option's declared type"); plugins/manifest-reference.md § User configuration (the types, `required`,
 * `options`, `min`/`max`). Turning a text into a number, a boolean or a list is the kit's judgment
 * (the docs show strings only), so these tests sit outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import type { UserConfigOption } from '../../src/format/index.ts';
import { checkGiven, convertText, unsetKeys, withValues } from '../../src/cli/user-config-input.ts';

const option = (extra: Partial<UserConfigOption>): UserConfigOption => ({
  type: 'string',
  title: 'T',
  description: 'D',
  ...extra,
});

const declared = {
  api_url: option({ required: true }),
  retries: option({ type: 'number', min: 0, max: 5 }),
  verbose: option({ type: 'boolean' }),
  tone: option({ options: ['neutral', 'warm'], default: 'neutral' }),
  tags: option({ multiple: true }),
};

describe('converting a text to the option type', () => {
  test('numbers and booleans are parsed; a text that is neither stays text and fails the check', () => {
    expect(convertText(declared.retries, '3')).toBe(3);
    expect(convertText(declared.retries, 'three')).toBe('three');
    expect(convertText(declared.verbose, 'true')).toBe(true);
    expect(convertText(declared.verbose, 'false')).toBe(false);
    expect(convertText(declared.verbose, 'yes')).toBe('yes');
  });

  test('a multiple list splits on commas', () => {
    expect(convertText(declared.tags, 'a, b')).toEqual(['a', 'b']);
    expect(convertText(declared.tags, '')).toEqual([]);
  });
});

describe('checking given values', () => {
  test('accepts values that fit and converts them', () => {
    expect(checkGiven(declared, { api_url: 'https://x', retries: '2' })).toEqual({
      accepted: { api_url: 'https://x', retries: 2 },
      problems: [],
    });
  });

  test('reports an undeclared key, listing the declared ones', () => {
    const { problems } = checkGiven(declared, { nope: '1' });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ key: 'nope', undeclared: true });
    expect(problems[0]?.message).toContain('api_url');
  });

  test('reports a value outside the type, the bounds, the options or an empty required one', () => {
    const bad = checkGiven(declared, { retries: '9', tone: 'loud', api_url: '', verbose: 'maybe' });
    expect(bad.problems.map((p) => p.key).toSorted()).toEqual([
      'api_url',
      'retries',
      'tone',
      'verbose',
    ]);
    expect(bad.accepted).toEqual({});
  });
});

describe('which options are unset', () => {
  const config = { declared, values: { api_url: 'https://x' } };

  test('an option with neither a saved value nor a default is unset', () => {
    expect(unsetKeys(config)).toEqual(['retries', 'verbose', 'tags']);
  });

  test('values merged in count as set', () => {
    expect(unsetKeys(withValues(config, { retries: 1 }))).toEqual(['verbose', 'tags']);
  });
});
