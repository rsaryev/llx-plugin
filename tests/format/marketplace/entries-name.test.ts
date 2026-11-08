/**
 * marketplace-reference.md § Plugin entries (the field table), § Validation messages (the
 * `plugins[i]` rows). create-marketplace.md § Rules for plugin entries (the entry name is the install id).
 *
 * The plugin source parser is a later piece of the stream: a stand-in (`stubSourceParser`) proves
 * that the entry reader delegates `source` to it; marketplaces are read with the real entry reader.
 */
import { expect, test } from 'bun:test';
import {
  loaded,
  rawEntry,
  readOne,
  readPlugins,
  slotAt,
  validatePlugins,
} from '../../support/marketplace-entries.ts';
import { errorsOf } from '../../support/marketplace-fixtures.ts';
import { spec } from '../../support/spec.ts';

spec('marketplace.entry.name', () => {
  test('a name is letters, digits, ".", "_" and "-", starting with a letter or digit', () => {
    for (const name of ['my-plugin', 'Plugin_1.0', '9lives', 'a']) {
      expect(readOne(rawEntry({ name })).issues).toEqual([]);
      expect(loaded(rawEntry({ name })).name).toBe(name);
    }
  });

  test('a name with a space fails validation with the documented message', () => {
    const { entry, issues } = readOne(rawEntry({ name: 'my plugin' }));
    expect(entry).toBeUndefined();
    expect(issues).toContainEqual({
      severity: 'error',
      path: 'plugins[0].name',
      message: 'Plugin name cannot contain spaces. Use kebab-case (e.g., "my-plugin")',
    });
  });

  test('a name Claude Code cannot install is refused with the documented message', () => {
    for (const name of ['-leading', '.dot', 'under_ñ', 'a@b', 'a/b']) {
      const { entry, issues } = readOne(rawEntry({ name }));
      expect(entry).toBeUndefined();
      expect(issues).toContainEqual({
        severity: 'error',
        path: 'plugins[0].name',
        message: `Claude Code cannot install plugin "${name}". Each part of a plugin id (plugin@marketplace) may use only the letters a-z and A-Z, digits, ".", "_" and "-", and must start with a letter or digit. Change this entry's "name".`,
      });
    }
  });

  test('a control or bidirectional-formatting character is refused with the documented message', () => {
    for (const name of ['my\nplugin', 'my\u001bplugin', 'my‮plugin']) {
      const { entry, issues } = readOne(rawEntry({ name }));
      expect(entry).toBeUndefined();
      expect(issues).toContainEqual({
        severity: 'error',
        path: 'plugins[0].name',
        message: 'Plugin name cannot contain control or bidirectional-formatting characters',
      });
    }
  });

  test('a name is required: absent is "Invalid input", of the wrong type names the type', () => {
    const absent = readOne(rawEntry({ name: undefined }), slotAt(3));
    expect(absent.entry).toBeUndefined();
    expect(absent.issues).toEqual([
      { severity: 'error', path: 'plugins[3].name', message: 'Invalid input' },
    ]);
    const wrong = readOne(rawEntry({ name: 7 }));
    expect(wrong.entry).toBeUndefined();
    expect(wrong.issues).toEqual([
      {
        severity: 'error',
        path: 'plugins[0].name',
        message: 'Invalid input: expected string, received number',
      },
    ]);
  });

  test('two entries with one name are reported "Duplicate plugin name"', () => {
    const result = readPlugins([
      rawEntry({ name: 'dup' }),
      rawEntry({ name: 'ok' }),
      rawEntry({ name: 'dup' }),
    ]);
    expect(result.issues).toContainEqual({
      severity: 'error',
      path: 'plugins[2].name',
      message: 'Duplicate plugin name "dup" found in marketplace',
    });
    expect(result.marketplace?.plugins.map((entry) => entry.name)).toEqual(['dup', 'ok']);
  });

  test('a name Claude Desktop rejects is a warning and the entry still loads', () => {
    const long = 'a'.repeat(129);
    const { entry, issues } = readOne(rawEntry({ name: long }));
    expect(entry?.name).toBe(long);
    expect(issues).toEqual([
      {
        severity: 'warning',
        path: 'plugins[0].name',
        message: `Plugin name "${long}" is not accepted by Claude Desktop (letters, digits, ".", "_", "-"; must start alphanumeric; max 128 chars)`,
      },
    ]);
  });

  test("validate refuses a name that passes as one of Anthropic's own; loading does not", () => {
    const plugins = [rawEntry({ name: 'claude-helper' })];
    expect(validatePlugins(plugins)).toContainEqual({
      severity: 'error',
      path: 'plugins[0].name',
      message: 'Plugin name "claude-helper" is reserved: it passes as one of Anthropic\'s own',
    });
    const loadedResult = readPlugins(plugins);
    expect(errorsOf(loadedResult.issues)).toEqual([]);
    expect(loadedResult.marketplace?.plugins.map((entry) => entry.name)).toEqual(['claude-helper']);
  });

  test("validate warns about a name that reads as one of Anthropic's own", () => {
    expect(validatePlugins([rawEntry({ name: 'mcp-for-claude' })])).toEqual([
      {
        severity: 'warning',
        path: 'plugins[0].name',
        message: 'Plugin name "mcp-for-claude" reads as one of Anthropic\'s own',
      },
    ]);
  });
});
