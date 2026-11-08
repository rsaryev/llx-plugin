/**
 * marketplace-reference.md § Top-level fields (the `name` row), § Reserved names and § Validation
 * messages (the rows for the marketplace's name); plugins/troubleshooting.md § Cannot add
 * marketplace. The document is read through `readMarketplace` and `validateMarketplace`, so each
 * case proves what the kit does with a marketplace of that name; `marketplace-names.test.ts`
 * proves the lists and rules one by one.
 */
import { expect, test } from 'bun:test';
import {
  readMarketplace,
  validateMarketplace,
} from '../../../src/format/marketplace/marketplace.ts';
import { errorsOf, recordingEntryReader, withFields } from '../../support/marketplace-fixtures.ts';
import { spec } from '../../support/spec.ts';

const read = (raw: unknown) => readMarketplace(raw, {}, recordingEntryReader().read);
const validate = (raw: unknown) => validateMarketplace(raw, {}, recordingEntryReader().read);

spec('marketplace.field.name', () => {
  test('is required: a file without one does not load', () => {
    const result = read(withFields({ name: undefined }));
    expect(result.marketplace).toBeUndefined();
    expect(result.issues).toContainEqual({
      severity: 'error',
      path: 'name',
      message: 'Invalid input',
    });
  });

  test('empty is "Marketplace must have a name"', () => {
    const result = read(withFields({ name: '' }));
    expect(result.marketplace).toBeUndefined();
    expect(errorsOf(result.issues)).toEqual([
      { severity: 'error', path: 'name', message: 'Marketplace must have a name' },
    ]);
  });

  test('a name of the wrong type is an error on name', () => {
    const result = read(withFields({ name: 7 }));
    expect(result.marketplace).toBeUndefined();
    expect(errorsOf(result.issues).map((found) => found.path)).toEqual(['name']);
  });

  test('is carried as the identifier users type after "@"', () => {
    for (const name of ['my-marketplace', 'internal.tools_2', 'Acme', '0day']) {
      expect(read(withFields({ name })).marketplace?.name).toBe(name);
    }
  });

  test('a name that breaks the grammar, with the documented example "_internal", does not load', () => {
    const result = read(withFields({ name: '_internal' }));
    expect(result.marketplace).toBeUndefined();
    expect(errorsOf(result.issues)).toEqual([
      {
        severity: 'error',
        path: 'name',
        message:
          'Claude Code cannot install plugins from marketplace "_internal". Each part of a plugin id (plugin@marketplace) may use only the letters a-z and A-Z, digits, ".", "_" and "-", and must start with a letter or digit. Change the marketplace\'s "name".',
      },
    ]);
  });

  test('"claude plugin validate" fails the same name', () => {
    expect(
      errorsOf(validate(withFields({ name: 'my marketplace' }))).map((i) => i.message),
    ).toContain('Marketplace name cannot contain spaces. Use kebab-case (e.g., "my-marketplace")');
  });

  test('a name with a path separator or ".." carries the documented message', () => {
    for (const name of ['a/b', 'a\\b', 'a..b', '.']) {
      const messages = errorsOf(read(withFields({ name })).issues).map((found) => found.message);
      expect(messages).toContain(
        'Marketplace name cannot contain path separators (/ or \\), ".." sequences, or be "."',
      );
    }
  });

  test('a control or bidirectional-formatting character is refused with the documented message', () => {
    for (const name of ['my\u001b-market', 'my\n-market', 'my‮-market']) {
      const messages = errorsOf(read(withFields({ name })).issues).map((found) => found.message);
      expect(messages).toContain(
        'Marketplace name cannot contain control or bidirectional-formatting characters',
      );
    }
  });

  test('Claude Desktop warns about its reserved names and keeps the marketplace', () => {
    for (const name of ['org', 'org-provisioned', 'unknown', 'ORG']) {
      const result = read(withFields({ name }));
      expect(result.marketplace?.name).toBe(name);
      expect(result.issues).toContainEqual({
        severity: 'warning',
        path: 'name',
        message: `Marketplace name "${name}" is reserved in Claude Desktop`,
      });
    }
  });

  test('Claude Desktop warns about a name over 128 characters and keeps the marketplace', () => {
    const name = 'a'.repeat(129);
    const result = read(withFields({ name }));
    expect(result.marketplace?.name).toBe(name);
    expect(result.issues).toEqual([
      {
        severity: 'warning',
        path: 'name',
        message: `Marketplace name "${name}" is not accepted by Claude Desktop (letters, digits, ".", "_", "-"; must start alphanumeric; max 128 chars)`,
      },
    ]);
  });

  test('"inline" is reserved for --plugin-dir session plugins', () => {
    const result = read(withFields({ name: 'inline' }));
    expect(result.marketplace).toBeUndefined();
    expect(result.issues).toContainEqual({
      severity: 'error',
      path: 'name',
      message: 'Marketplace name "inline" is reserved for --plugin-dir session plugins',
    });
  });

  test('builtin, skills-dir, synced, claude-plugin-test, npm, pip, uv, cargo, github and gh are errors on name', () => {
    const reserved: readonly (readonly [string, string])[] = [
      ['builtin', 'is reserved for built-in plugins'],
      ['skills-dir', 'is reserved for plugins auto-loaded from .claude/skills/'],
      ['synced', 'is reserved for plugins synced from your claude.ai account'],
      ['claude-plugin-test', 'is reserved for plugin tests'],
      ['npm', 'is reserved'],
      ['pip', 'is reserved'],
      ['uv', 'is reserved'],
      ['cargo', 'is reserved'],
      ['github', 'is reserved'],
      ['gh', 'is reserved'],
    ];
    for (const [name, reason] of reserved) {
      expect(errorsOf(validate(withFields({ name })))).toEqual([
        { severity: 'error', path: 'name', message: `Marketplace name "${name}" ${reason}` },
      ]);
    }
  });

  test('npm, pip, uv, cargo, github and gh are reserved in any casing', () => {
    for (const name of ['NPM', 'Pip', 'UV', 'Cargo', 'GitHub', 'GH']) {
      expect(errorsOf(validate(withFields({ name }))).length).toBeGreaterThan(0);
    }
  });

  test('a name that impersonates an official marketplace is an error, the documented examples included', () => {
    for (const name of ['official-claude-plugins', 'claude-plugins-v2', 'anthropic-plugins-v2']) {
      expect(validate(withFields({ name }))).toContainEqual({
        severity: 'error',
        path: 'name',
        message: 'Marketplace name impersonates an official Anthropic/Claude marketplace',
      });
    }
  });

  test('any name containing a non-ASCII character impersonates', () => {
    for (const name of ['café-tools', 'plugins-é', 'сlaude-tools']) {
      const messages = validate(withFields({ name })).map((found) => found.message);
      expect(messages).toContain(
        'Marketplace name impersonates an official Anthropic/Claude marketplace',
      );
    }
  });

  test('the exact official names pass validation (they are refused when the marketplace is added)', () => {
    for (const name of [
      'claude-plugins-official',
      'claude-community',
      'anthropic-plugin-directory',
    ]) {
      expect(errorsOf(validate(withFields({ name })))).toEqual([]);
    }
  });

  test('adding or loading refuses an official name unless the source is github.com/anthropics', () => {
    const raw = withFields({ name: 'claude-plugins-official' });
    const refused = (origin: Parameters<typeof readMarketplace>[1]) =>
      readMarketplace(raw, origin, recordingEntryReader().read).marketplace === undefined;
    expect(refused({})).toBe(true);
    expect(refused({ origin: { kind: 'directory', path: '/tmp/x' } })).toBe(true);
    expect(
      refused({
        origin: { kind: 'github', repo: 'acme/plugins', path: '.claude-plugin/marketplace.json' },
      }),
    ).toBe(true);
    expect(
      refused({
        origin: {
          kind: 'github',
          repo: 'anthropics/claude-plugins-official',
          path: '.claude-plugin/marketplace.json',
        },
      }),
    ).toBe(false);
    expect(
      refused({
        origin: {
          kind: 'git',
          url: 'https://github.com/anthropics/claude-plugins-official.git',
          path: '.claude-plugin/marketplace.json',
        },
      }),
    ).toBe(false);
  });

  test('a symbol or a trailing dot in place of a hyphen spells a reserved name and is refused on loading', () => {
    const result = read(withFields({ name: 'claude.code.plugins' }));
    expect(result.marketplace).toBeUndefined();
    expect(result.issues).toContainEqual({
      severity: 'error',
      path: 'name',
      message:
        '"claude.code.plugins" is another spelling of "claude-code-plugins", a reserved marketplace name',
    });
  });

  test('a JavaScript member name is refused on loading with the documented message', () => {
    const result = read(withFields({ name: 'constructor' }));
    expect(result.marketplace).toBeUndefined();
    expect(result.issues).toContainEqual({
      severity: 'error',
      path: 'name',
      message:
        'Cannot add marketplace "constructor": Claude Code reserves this name and cannot register a marketplace under it. The name is set by "name" in the marketplace\'s marketplace.json; ask its maintainer to change it.',
    });
  });

  test('a name starting with "claudeai-" is reserved for marketplaces hosted on claude.ai', () => {
    const raw = withFields({ name: 'claudeai-organization-library' });
    const refused = read(raw);
    expect(refused.marketplace).toBeUndefined();
    expect(refused.issues).toContainEqual({
      severity: 'error',
      path: 'name',
      message:
        'Cannot add marketplace "claudeai-organization-library": names starting with "claudeai-" are reserved for marketplaces hosted on claude.ai',
    });
    const hosted = readMarketplace(raw, { hostedOnClaudeAi: true }, recordingEntryReader().read);
    expect(hosted.marketplace?.name).toBe('claudeai-organization-library');
  });
});
