/**
 * settings-reference.md § `pluginConfigs` (keyed by plugin ID; an object with an `options` field
 * mapping each option name to a string, number, Boolean, or array of strings, and an optional
 * `mcpServers` field "holding per-server user configuration values in the same shape"; Scope: User
 * or managed; "Built-in plugins store their options under the same key with an `@builtin` suffix ...
 * Before v2.1.285, the plugin's ID was `agents-md@builtin`. Later versions read an entry under either
 * ID"; "Claude Code ignores project and local entries because it substitutes these values into plugin
 * hook, MCP, and LSP configurations, and a cloned repository must not be able to supply them"),
 * plugins/mods/admin.md § "Set options on the built-in guard" ("Claude Code reads the options only
 * under `cc-plugin-sec-default@builtin` ... `pluginConfigs` doesn't [accept `sec-default@builtin`]";
 * only managed settings count).
 */
import { describe, expect, test } from 'bun:test';
import { pluginConfig } from '../../../src/settings/plugins/index.ts';
import { spec } from '../../support/spec.ts';
import { plain } from '../../support/settings-layers.ts';
import { viewOf } from '../../support/plugin-settings.ts';

const entry = (value: string, option = 'mode') => ({
  pluginConfigs: { 'p@m': { options: { [option]: value } } },
});

const guardOption = (allowManagedModsOnly: boolean) => ({
  pluginConfigs: { 'cc-plugin-sec-default@builtin': { options: { allowManagedModsOnly } } },
});

spec('settings.key.pluginConfigs', () => {
  test('the docs example stores the api_endpoint option of the deployer plugin', () => {
    const view = viewOf([
      'user',
      {
        pluginConfigs: {
          'deployer@acme-tools': { options: { api_endpoint: 'https://api.example.com' } },
        },
      },
    ]);
    const config = pluginConfig(view, 'deployer@acme-tools');
    expect(plain(config.options)).toEqual({ api_endpoint: 'https://api.example.com' });
    expect(plain(config.mcpServers)).toEqual({});
    expect(config.issues).toEqual([]);
  });

  test('an option is a string, a number, a Boolean or an array of strings', () => {
    const options = { text: 'a', count: 3, flag: false, tags: ['x', 'y'] };
    const config = pluginConfig(viewOf(['user', { pluginConfigs: { 'p@m': { options } } }]), 'p@m');
    expect(plain(config.options)).toEqual(options);
  });

  test('a value of another shape is dropped with a warning and the others stay', () => {
    const config = pluginConfig(
      viewOf([
        'user',
        {
          pluginConfigs: {
            'p@m': { options: { good: 'yes', nested: { a: 1 }, numbers: [1, 2], nothing: null } },
          },
        },
      ]),
      'p@m',
    );
    expect(plain(config.options)).toEqual({ good: 'yes' });
    expect(config.issues.map((issue) => issue.severity)).toEqual(['warning', 'warning', 'warning']);
    expect(config.issues.map((issue) => issue.path)).toEqual([
      'pluginConfigs:p@m.options.nested',
      'pluginConfigs:p@m.options.numbers',
      'pluginConfigs:p@m.options.nothing',
    ]);
  });

  test('mcpServers holds per-server values in the same shape, per server name', () => {
    const config = pluginConfig(
      viewOf([
        'user',
        {
          pluginConfigs: {
            'p@m': {
              options: { region: 'eu' },
              mcpServers: { github: { host: 'ghe.example.com', port: 8443, verbose: true } },
            },
          },
        },
      ]),
      'p@m',
    );
    expect(plain(config.options)).toEqual({ region: 'eu' });
    expect(plain(config.mcpServers)).toEqual({
      github: { host: 'ghe.example.com', port: 8443, verbose: true },
    });
  });

  test('a plugin with no entry has no options and no server values', () => {
    const config = pluginConfig(
      viewOf(['user', { pluginConfigs: { 'a@m': { options: { x: 1 } } } }]),
      'b@m',
    );
    expect(plain(config.options)).toEqual({});
    expect(plain(config.mcpServers)).toEqual({});
  });

  test('user and managed settings supply entries; managed settings win for the same plugin', () => {
    expect(pluginConfig(viewOf(['user', entry('user')]), 'p@m').options.mode).toBe('user');
    expect(pluginConfig(viewOf(['managed', entry('managed')]), 'p@m').options.mode).toBe('managed');
    const both = viewOf(['user', entry('user')], ['managed', entry('managed')]);
    expect(pluginConfig(both, 'p@m').options.mode).toBe('managed');
  });

  test('project, local and --settings entries are ignored: a cloned repository cannot supply them', () => {
    for (const scope of ['project', 'local', 'flag'] as const) {
      expect(
        plain(
          pluginConfig(viewOf([scope, entry('https://evil.example', 'endpoint')]), 'p@m').options,
        ),
      ).toEqual({});
      const withUser = viewOf(
        ['user', entry('https://good.example', 'endpoint')],
        [scope, entry('https://evil.example', 'endpoint')],
      );
      expect(pluginConfig(withUser, 'p@m').options.endpoint).toBe('https://good.example');
    }
  });

  test('a built-in plugin is read under either ID: agents-md@builtin before v2.1.285, cc-plugin-agents-md@builtin after', () => {
    const options = { instructionFiles: 'agents' };
    const old = viewOf(['user', { pluginConfigs: { 'agents-md@builtin': { options } } }]);
    const current = viewOf([
      'user',
      { pluginConfigs: { 'cc-plugin-agents-md@builtin': { options } } },
    ]);
    for (const view of [old, current]) {
      expect(plain(pluginConfig(view, 'cc-plugin-agents-md@builtin').options)).toEqual(options);
      expect(plain(pluginConfig(view, 'agents-md@builtin').options)).toEqual(options);
    }
  });

  test('the guard options are read only under cc-plugin-sec-default@builtin, never sec-default@builtin', () => {
    const managed = {
      pluginConfigs: {
        'cc-plugin-sec-default@builtin': { options: { allowManagedModsOnly: true } },
      },
    };
    const view = viewOf(['managed', managed]);
    expect(pluginConfig(view, 'cc-plugin-sec-default@builtin').options.allowManagedModsOnly).toBe(
      true,
    );
    expect(plain(pluginConfig(view, 'sec-default@builtin').options)).toEqual({});
    const wrongId = viewOf([
      'managed',
      { pluginConfigs: { 'sec-default@builtin': { options: { allowManagedModsOnly: true } } } },
    ]);
    expect(plain(pluginConfig(wrongId, 'cc-plugin-sec-default@builtin').options)).toEqual({});
  });

  test('the guard option in user, project, local or --settings files changes nothing', () => {
    const guardEntry = {
      pluginConfigs: {
        'cc-plugin-sec-default@builtin': { options: { allowManagedModsOnly: true } },
      },
    };
    for (const scope of ['user', 'project', 'local', 'flag'] as const) {
      expect(
        plain(pluginConfig(viewOf([scope, guardEntry]), 'cc-plugin-sec-default@builtin').options),
      ).toEqual({});
    }
  });

  test('a user guard option does not loosen or replace the managed one, and a managed entry without it is not filled by user', () => {
    const userTrue = viewOf(['user', guardOption(true)], ['managed', guardOption(false)]);
    expect(plain(pluginConfig(userTrue, 'cc-plugin-sec-default@builtin').options)).toEqual({
      allowManagedModsOnly: false,
    });
    const userFalse = viewOf(['user', guardOption(false)], ['managed', guardOption(true)]);
    expect(plain(pluginConfig(userFalse, 'cc-plugin-sec-default@builtin').options)).toEqual({
      allowManagedModsOnly: true,
    });
    const unmanaged = viewOf(['user', guardOption(true)], ['managed', { pluginConfigs: {} }]);
    expect(plain(pluginConfig(unmanaged, 'cc-plugin-sec-default@builtin').options)).toEqual({});
  });

  test('the user file still supplies the options of another plugin', () => {
    const view = viewOf(['user', { pluginConfigs: { 'p@m': { options: { a: 1 } } } }]);
    expect(plain(pluginConfig(view, 'p@m').options)).toEqual({ a: 1 });
  });
});

describe('what the docs leave open (spec/judgments.md)', () => {
  test('a managed entry replaces the user entry of the same plugin whole, options and servers alike', () => {
    const view = viewOf(
      [
        'user',
        { pluginConfigs: { 'p@m': { options: { a: 1, b: 2 }, mcpServers: { s: { k: 'v' } } } } },
      ],
      ['managed', { pluginConfigs: { 'p@m': { options: { a: 9 } } } }],
    );
    const config = pluginConfig(view, 'p@m');
    expect(plain(config.options)).toEqual({ a: 9 });
    expect(plain(config.mcpServers)).toEqual({});
  });

  test('with both IDs of a built-in plugin in one file, the current ID wins whole', () => {
    const view = viewOf([
      'user',
      {
        pluginConfigs: {
          'agents-md@builtin': { options: { instructionFiles: 'old' } },
          'cc-plugin-agents-md@builtin': { options: { instructionFiles: 'new' } },
        },
      },
    ]);
    expect(pluginConfig(view, 'agents-md@builtin').options.instructionFiles).toBe('new');
  });

  test('a higher file that holds the other ID of a built-in plugin still wins over a lower file', () => {
    const view = viewOf(
      [
        'user',
        {
          pluginConfigs: {
            'cc-plugin-agents-md@builtin': { options: { instructionFiles: 'user' } },
          },
        },
      ],
      [
        'managed',
        { pluginConfigs: { 'agents-md@builtin': { options: { instructionFiles: 'managed' } } } },
      ],
    );
    expect(pluginConfig(view, 'cc-plugin-agents-md@builtin').options.instructionFiles).toBe(
      'managed',
    );
  });

  test('a field that is not an object holds nothing', () => {
    const view = viewOf(['user', { pluginConfigs: { 'b@m': { options: 'x', mcpServers: [] } } }]);
    expect(plain(pluginConfig(view, 'b@m').options)).toEqual({});
    expect(plain(pluginConfig(view, 'b@m').mcpServers)).toEqual({});
  });

  test('an entry that is not an object is dropped with a warning and does not shadow a lower file', () => {
    const view = viewOf(
      ['user', { pluginConfigs: { 'p@m': { options: { a: 1 } } } }],
      ['managed', { pluginConfigs: { 'p@m': 'x' } }],
    );
    const config = pluginConfig(view, 'p@m');
    expect(plain(config.options)).toEqual({ a: 1 });
    expect(config.issues.map((issue) => issue.path)).toEqual(['pluginConfigs:p@m']);
    expect(config.issues.map((issue) => issue.severity)).toEqual(['warning']);
  });

  test('an entry that is not an object, with nothing below it, holds nothing and still warns', () => {
    const config = pluginConfig(viewOf(['user', { pluginConfigs: { 'a@m': 'text' } }]), 'a@m');
    expect(plain(config.options)).toEqual({});
    expect(plain(config.mcpServers)).toEqual({});
    expect(config.issues.map((issue) => issue.path)).toEqual(['pluginConfigs:a@m']);
  });

  test('a server whose values are not an object is dropped with a warning', () => {
    const config = pluginConfig(
      viewOf(['user', { pluginConfigs: { 'p@m': { mcpServers: { bad: 'x', ok: { k: 1 } } } } }]),
      'p@m',
    );
    expect(plain(config.mcpServers)).toEqual({ ok: { k: 1 } });
    expect(config.issues.map((issue) => issue.path)).toEqual(['pluginConfigs:p@m.mcpServers.bad']);
  });
});
