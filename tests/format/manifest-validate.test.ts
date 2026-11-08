/**
 * plugins/manifest-reference.md § `name` and § Validate the manifest. Loading and validating
 * differ: `claude plugin validate` reports a reserved name, a name that is not kebab-case and a
 * missing version, description or author, while Claude Code still installs and loads the plugin.
 */
import { expect, test } from 'bun:test';
import { readManifest, validateManifest } from '../../src/format/index.ts';
import { spec } from '../support/spec.ts';

const complete = { version: '1.0.0', description: 'Demo', author: { name: 'Team' } };
const issuesFor = (name: string) =>
  validateManifest({ name, ...complete }).map((found) => [found.severity, found.message]);

spec('manifest.field.name', () => {
  test('may not hold a space, @, :, a path separator, a control or a bidi character', () => {
    const bidi = `a${String.fromCharCode(0x202e)}b`;
    const control = `a${String.fromCharCode(0x07)}b`;
    for (const name of ['my plugin', 'a@b', 'a:b', 'a/b', 'a\\b', control, bidi, '']) {
      expect(readManifest({ name }).manifest).toBeUndefined();
    }
  });

  test('a name that is not kebab-case is a warning', () => {
    expect(issuesFor('MyPlugin')).toEqual([
      ['warning', 'Plugin name "MyPlugin" is not kebab-case'],
    ]);
  });

  test('names that pass as one of Anthropic’s own are errors to the validator', () => {
    const reserved = "is reserved: it passes as one of Anthropic's own";
    for (const name of [
      'claude-helper',
      'anthropic-tools',
      'anthropics-x',
      'cc-plugin-x',
      'claude',
      'Claude_Code',
      'claude-mods',
      'official-claude-tools',
      'anthropic--official',
    ]) {
      expect(issuesFor(name)).toContainEqual(['error', `Plugin name "${name}" ${reserved}`]);
    }
  });

  test('claude or anthropic as a whole word elsewhere is a warning', () => {
    expect(issuesFor('mcp-for-claude')).toEqual([
      ['warning', 'Plugin name "mcp-for-claude" reads as one of Anthropic\'s own'],
    ]);
  });

  test('Claude Code still loads a plugin whose name the validator refuses', () => {
    expect(readManifest({ name: 'claude-helper' }).manifest?.name).toBe('claude-helper');
  });
});

spec(['manifest.field.version', 'manifest.field.description', 'manifest.field.author'], () => {
  test('a missing version, description or author is a validator warning', () => {
    const found = validateManifest({ name: 'demo' });
    expect(found.map((issue) => [issue.severity, issue.path])).toEqual([
      ['warning', 'version'],
      ['warning', 'description'],
      ['warning', 'author'],
    ]);
  });
});
