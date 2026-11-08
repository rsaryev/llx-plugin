/**
 * marketplace-reference.md § Validation messages (the rows for marketplace and plugin names) and
 * troubleshooting.md § `Cannot add marketplace "<name>": Claude Code cannot install plugins from a
 * marketplace with this name`: the grammar of each part of a plugin id (`plugin@marketplace`), the
 * name errors every entry, rename target and dependency shares, and the Claude Desktop warnings.
 *
 * The requirements that name these rules (`marketplace.field.name`, `marketplace.entry.name`) say
 * more than the id grammar (required, kebab-case, reserved names, duplicates), so this file claims
 * none of them: the file reader and the entry reader prove them and call these functions. The
 * choices the docs leave open are judgments, tested here outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import {
  PLUGIN_ID_PART,
  desktopNameIssues,
  isPluginIdPart,
  pluginIdIssues,
} from '../../../src/format/marketplace/ids.ts';

const INSTALL_RULE =
  'Each part of a plugin id (plugin@marketplace) may use only the letters a-z and A-Z, digits, ".", "_" and "-", and must start with a letter or digit.';

describe('the grammar of one part of a plugin id', () => {
  test('letters, digits, ".", "_" and "-", starting with a letter or digit', () => {
    for (const name of [
      'my-plugin',
      'MyPlugin2',
      'internal-tools',
      'a',
      '0day',
      'a.b_c-d',
      'x..y',
    ]) {
      expect(isPluginIdPart(name)).toBe(true);
      expect(PLUGIN_ID_PART.test(name)).toBe(true);
    }
  });

  test('refuses what starts with "_", "." or "-", the documented `_internal` example included', () => {
    for (const name of ['_internal', '.hidden', '-lead']) expect(isPluginIdPart(name)).toBe(false);
  });

  test('refuses "@", ":", separators, spaces and non-ASCII letters', () => {
    for (const name of ['a@b', 'a:b', 'a/b', 'a\\b', 'a b', 'café', 'a+b', ''])
      expect(isPluginIdPart(name)).toBe(false);
  });

  test('is not fooled by a trailing newline', () => {
    expect(isPluginIdPart('plugin\n')).toBe(false);
  });
});

describe('pluginIdIssues: the quoted messages', () => {
  test('a marketplace name that breaks the grammar, with the documented message and field', () => {
    expect(pluginIdIssues('marketplace', '_internal', 'name')).toEqual([
      {
        severity: 'error',
        path: 'name',
        message: `Claude Code cannot install plugins from marketplace "_internal". ${INSTALL_RULE} Change the marketplace's "name".`,
      },
    ]);
  });

  test('an entry name that breaks the grammar, with the documented message and field', () => {
    expect(pluginIdIssues('plugin', 'my@plugin', 'plugins[2].name')).toEqual([
      {
        severity: 'error',
        path: 'plugins[2].name',
        message: `Claude Code cannot install plugin "my@plugin". ${INSTALL_RULE} Change this entry's "name".`,
      },
    ]);
  });

  test('a valid name reports nothing', () => {
    expect(pluginIdIssues('marketplace', 'internal-tools', 'name')).toEqual([]);
    expect(pluginIdIssues('plugin', 'my-plugin', 'plugins[0].name')).toEqual([]);
  });

  test('spaces: the kebab-case hint names the marketplace or the plugin', () => {
    const marketplace = pluginIdIssues('marketplace', 'my marketplace', 'name');
    expect(marketplace.map((found) => found.message)).toContain(
      'Marketplace name cannot contain spaces. Use kebab-case (e.g., "my-marketplace")',
    );
    const plugin = pluginIdIssues('plugin', 'my plugin', 'plugins[1].name');
    expect(plugin.map((found) => found.message)).toContain(
      'Plugin name cannot contain spaces. Use kebab-case (e.g., "my-plugin")',
    );
    expect(plugin.every((found) => found.severity === 'error')).toBe(true);
  });

  test('control and bidirectional-formatting characters, "such as an escape or a newline"', () => {
    for (const name of ['a\u001bb', 'a\nb', 'a‮b', 'a⁦b']) {
      expect(pluginIdIssues('marketplace', name, 'name').map((found) => found.message)).toContain(
        'Marketplace name cannot contain control or bidirectional-formatting characters',
      );
      expect(
        pluginIdIssues('plugin', name, 'plugins[0].name').map((found) => found.message),
      ).toContain('Plugin name cannot contain control or bidirectional-formatting characters');
    }
  });

  test('every rule that fires is reported on the field it is about', () => {
    const found = pluginIdIssues('plugin', 'a b\n', 'plugins[3].name');
    expect(found.map((issue) => issue.path)).toEqual(Array(found.length).fill('plugins[3].name'));
    expect(found.length).toBe(3);
  });
});

describe('desktopNameIssues: names Claude Desktop rejects', () => {
  test('marketplace names org, org-provisioned and unknown, in any casing', () => {
    for (const name of ['org', 'org-provisioned', 'unknown', 'ORG', 'Org-Provisioned', 'Unknown']) {
      expect(desktopNameIssues('marketplace', name, 'name')).toEqual([
        {
          severity: 'warning',
          path: 'name',
          message: `Marketplace name "${name}" is reserved in Claude Desktop`,
        },
      ]);
    }
  });

  test('a plugin entry named org is not reserved: the reserved list is for marketplaces', () => {
    expect(desktopNameIssues('plugin', 'org', 'plugins[0].name')).toEqual([]);
  });

  test('"not accepted" for a marketplace and for a plugin, with the documented wording', () => {
    expect(desktopNameIssues('marketplace', '_internal', 'name')).toEqual([
      {
        severity: 'warning',
        path: 'name',
        message:
          'Marketplace name "_internal" is not accepted by Claude Desktop (letters, digits, ".", "_", "-"; must start alphanumeric; max 128 chars)',
      },
    ]);
    expect(desktopNameIssues('plugin', 'my plugin', 'plugins[4].name')).toEqual([
      {
        severity: 'warning',
        path: 'plugins[4].name',
        message:
          'Plugin name "my plugin" is not accepted by Claude Desktop (letters, digits, ".", "_", "-"; must start alphanumeric; max 128 chars)',
      },
    ]);
  });

  test('at most 128 characters: 128 passes, 129 warns', () => {
    expect(desktopNameIssues('plugin', 'a'.repeat(128), 'plugins[0].name')).toEqual([]);
    expect(desktopNameIssues('plugin', 'a'.repeat(129), 'plugins[0].name')).toHaveLength(1);
  });

  test('a name that fits the grammar raises no Desktop warning', () => {
    expect(desktopNameIssues('marketplace', 'internal-tools', 'name')).toEqual([]);
  });
});

describe('judgments (spec/judgments.md)', () => {
  test('an empty name is the reader\'s "must have a name" error, not an id error', () => {
    expect(pluginIdIssues('marketplace', '', 'name')).toEqual([]);
    expect(pluginIdIssues('plugin', '', 'plugins[0].name')).toEqual([]);
    expect(desktopNameIssues('plugin', '', 'plugins[0].name')).toEqual([]);
  });

  test('"spaces" means U+0020; a tab or newline is a control character', () => {
    const tab = pluginIdIssues('plugin', 'a\tb', 'plugins[0].name').map((found) => found.message);
    expect(tab.some((message) => message.includes('cannot contain spaces'))).toBe(false);
    expect(tab.some((message) => message.includes('control or bidirectional'))).toBe(true);
  });

  test('a marketplace name with "..", a path separator or "." gets the path message; the grammar alone allows "x..y"', () => {
    const message =
      'Marketplace name cannot contain path separators (/ or \\), ".." sequences, or be "."';
    for (const name of ['x..y', '..', 'a/b', 'a\\b', '.'])
      expect(pluginIdIssues('marketplace', name, 'name').map((found) => found.message)).toContain(
        message,
      );
    expect(pluginIdIssues('marketplace', 'x..y', 'name')).toEqual([
      { severity: 'error', path: 'name', message },
    ]);
    expect(isPluginIdPart('x..y')).toBe(true);
  });

  test('"..": the docs forbid it in a marketplace name only, so a plugin entry named "x..y" has no id issue', () => {
    expect(pluginIdIssues('plugin', 'x..y', 'plugins[0].name')).toEqual([]);
  });
});
