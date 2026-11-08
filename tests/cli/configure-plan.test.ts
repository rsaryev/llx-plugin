/**
 * plugins/cli-reference.md § plugin configure: "Without flags, the command lists each option with up
 * to three labels: `required` or `optional`, then `sensitive` for an option the manifest declares
 * sensitive, then `set` or `not set`. It prints no saved values. With `--json`, the output includes
 * the saved values of options that aren't sensitive, and never the text of a sensitive one"; the
 * `--json` object "carries the options' `schema` and `choices`, their starting `inputs`, and the
 * `configured` and `unconfigured` option names. With `--values-stdin`, it carries the `saved` option
 * names and ... the `unconfigured` ones"; "Claude Code validates each value against the option's
 * declared type and prints `Configuration saved. Restart Claude Code to apply it.` If you pass a key
 * the manifest doesn't declare, or a value that fails validation, the command saves nothing, prints
 * `Failed to save configuration:` with the reason, and exits `1`. With `--json`, a refused value also
 * prints an object on stdout whose `refused` field carries the `message` and, when one option is at
 * fault, its `option` key"; "Pass the plugin's full `name@marketplace` id ... `configure` doesn't
 * accept a bare `name`. When no loaded plugin has that id, the command prints `No installed plugin has
 * the id "<plugin>".` and exits `1`". The listing's layout and the failure codes are outside
 * `spec(...)` and in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import {
  planConfigure,
  SAVE_FAILED,
  SAVED_MESSAGE,
  type ConfigurePlan,
} from '../../src/cli/configure-plan.ts';
import { renderCommand } from '../../src/cli/result.ts';
import type { UserConfigOption } from '../../src/format/index.ts';
import type { UserConfigValue } from '../../src/loading/resolve/user-config.ts';
import { spec } from '../support/spec.ts';

const option = (extra: Partial<UserConfigOption>): UserConfigOption => ({
  type: 'string',
  title: 'T',
  description: 'D',
  ...extra,
});

const ID = 'formatter@my-marketplace';
const SECRET = 'sk-live-very-secret';

const declared = {
  api_url: option({ title: 'API URL', required: true }),
  api_token: option({ title: 'API token', sensitive: true, required: true }),
  retries: option({ title: 'Retries', type: 'number', min: 0, max: 5 }),
  tone: option({ title: 'Tone', options: ['neutral', 'warm'], default: 'neutral' }),
};

const plan = (
  args: { plugin?: string; valuesStdin?: string; json?: boolean } = {},
  values: Record<string, UserConfigValue> = { api_url: 'https://example.com', api_token: SECRET },
): ConfigurePlan =>
  planConfigure({ plugin: ID, ...args }, { loaded: [{ id: ID, config: { declared, values } }] });

const human = (found: ConfigurePlan) => renderCommand(found.output, { json: false });
const json = (found: ConfigurePlan): Record<string, unknown> =>
  JSON.parse(renderCommand(found.output, { json: true }).stdout.at(-1) ?? '{}');

spec('cli.plugin.plugin configure', () => {
  test('without flags it lists each option with required or optional, sensitive and set or not set', () => {
    const text = human(plan({}, { api_url: 'https://example.com' })).stdout.join('\n');
    expect(text).toContain('api_url (required, set)');
    expect(text).toContain('api_token (required, sensitive, not set)');
    expect(text).toContain('retries (optional, not set)');
  });

  test('it prints no saved values', () => {
    const text = human(plan()).stdout.join('\n');
    expect(text).not.toContain('https://example.com');
    expect(text).not.toContain(SECRET);
  });

  test('--json carries the schema, the choices, the starting inputs, configured and unconfigured', () => {
    const found = json(plan({ json: true }, { api_url: 'https://example.com' }));
    expect(found).toMatchObject({
      choices: { tone: ['neutral', 'warm'] },
      inputs: { api_url: 'https://example.com', tone: 'neutral' },
      configured: ['api_url', 'tone'],
      unconfigured: ['api_token', 'retries'],
    });
    expect(found['schema']).toMatchObject({ api_token: { type: 'string', sensitive: true } });
  });

  test('--json includes the saved values of options that are not sensitive and never a sensitive one', () => {
    const text = JSON.stringify(json(plan({ json: true })));
    expect(text).toContain('https://example.com');
    expect(text).not.toContain(SECRET);
  });

  test('--values-stdin validates and saves, then prints Configuration saved', () => {
    const found = plan({ valuesStdin: '{"retries":"3","api_token":"abc"}' });
    expect(found.save).toEqual({ settings: { retries: 3 }, secrets: { api_token: 'abc' } });
    expect(human(found)).toEqual({ stdout: [SAVED_MESSAGE], stderr: [], exitCode: 0 });
    expect(SAVED_MESSAGE).toBe('Configuration saved. Restart Claude Code to apply it.');
  });

  test('options left out keep their saved values: only the given keys are saved', () => {
    const found = plan({ valuesStdin: '{"retries":"1"}' });
    expect(Object.keys(found.save?.settings ?? {})).toEqual(['retries']);
    expect(found.save?.secrets).toEqual({});
  });

  test('a key the manifest does not declare saves nothing and exits 1 with Failed to save configuration:', () => {
    const found = plan({ valuesStdin: '{"retries":"2","nope":"x"}' });
    expect(found.save).toBeUndefined();
    const out = human(found);
    expect(out.exitCode).toBe(1);
    expect(out.stderr[0]).toStartWith(SAVE_FAILED);
    expect(out.stderr[0]).toContain('nope');
  });

  test('a value that fails validation saves nothing, even for the options that were fine', () => {
    const found = plan({ valuesStdin: '{"retries":"9","tone":"warm"}' });
    expect(found.save).toBeUndefined();
    expect(human(found).stderr[0]).toStartWith('Failed to save configuration:');
  });

  test('a value that is not a single-line string is refused', () => {
    expect(plan({ valuesStdin: '{"api_url":"a\\nb"}' }).save).toBeUndefined();
    expect(plan({ valuesStdin: '{"retries":3}' }).save).toBeUndefined();
    expect(plan({ valuesStdin: '[1]' }).save).toBeUndefined();
    expect(plan({ valuesStdin: 'not json' }).save).toBeUndefined();
  });

  test('only the full name@marketplace id is accepted: a bare name has no installed plugin', () => {
    const found = plan({ plugin: 'formatter' });
    expect(human(found)).toEqual({
      stdout: [],
      stderr: ['No installed plugin has the id "formatter".'],
      exitCode: 1,
    });
  });

  test('--json with --values-stdin carries the saved option names and the ones still unconfigured', () => {
    const found = json(plan({ json: true, valuesStdin: '{"retries":"1"}' }, { api_url: 'u' }));
    expect(found).toMatchObject({ saved: ['retries'], unconfigured: ['api_token'] });
  });

  test('--json for a refused value prints a refused object with the message and the one option at fault', () => {
    const found = json(plan({ json: true, valuesStdin: '{"retries":"9"}' }));
    expect(found).toMatchObject({ outcome: 'failed' });
    expect(found['refused']).toMatchObject({
      option: 'retries',
      message: expect.stringContaining('maximum'),
    });
  });

  test('--json with two options at fault names no single option', () => {
    const found = json(plan({ json: true, valuesStdin: '{"retries":"9","nope":"1"}' }));
    expect(found['refused']).not.toHaveProperty('option');
  });
});

describe('a plugin without options', () => {
  test('says it declares none', () => {
    const found = planConfigure(
      { plugin: ID },
      { loaded: [{ id: ID, config: { declared: {}, values: {} } }] },
    );
    expect(human(found).stdout.join('\n')).toContain('declares no userConfig options');
  });
});
