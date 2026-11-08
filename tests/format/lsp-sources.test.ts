/**
 * plugins/components.md § LSP servers ("The file maps each server name directly to its configuration,
 * with no wrapper object"; "When any entry is invalid, the whole file is skipped at load and `Invalid
 * LSP server config for ".lsp.json"` appears"; "its servers add to the ones in `.lsp.json`. When a
 * manifest server has the same name as one in `.lsp.json`, the manifest server replaces it");
 * plugins/manifest-reference.md § lspServers ("A server name declared later replaces an earlier one").
 *
 * Reading a whole map and joining the maps of a plugin. The fields are in lsp-config.test.ts.
 */
import { describe, expect, test } from 'bun:test';
import { mergeLspSources, readLspConfig, type LspServer } from '../../src/index.ts';

const gopls = { command: 'gopls', extensionToLanguage: { '.go': 'go' } };

const server = (command: string): LspServer => ({ command, extensionToLanguage: { '.go': 'go' } });
const part = (name: string, command: string) => ({
  servers: { [name]: server(command) },
  issues: [],
});
const issue = (message: string) => ({ severity: 'error' as const, path: '.lsp.json', message });

describe('.lsp.json (components.md, "LSP servers")', () => {
  const file = {
    gopls: { command: 'gopls', args: ['serve'], extensionToLanguage: { '.go': 'go' } },
  };

  test('maps each server name directly to its configuration', () => {
    const { servers, issues } = readLspConfig(file, '.lsp.json');
    expect(issues).toEqual([]);
    expect(servers).toEqual(file);
  });

  test('there is no wrapper: an "lspServers" key is a server, and an invalid one', () => {
    const { servers, issues } = readLspConfig({ lspServers: file }, '.lsp.json');
    expect(servers).toEqual({});
    expect(issues.map((found) => found.severity)).toEqual(['error']);
    expect(issues[0]?.message).toContain('lspServers');
  });

  test('when any entry is invalid the whole file is skipped, with the documented message', () => {
    const { servers, issues } = readLspConfig(
      { ...file, broken: { command: 'x y', extensionToLanguage: { '.x': 'x' } } },
      '.lsp.json',
    );
    expect(servers).toEqual({});
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('error');
    expect(issues[0]?.path).toBe('.lsp.json');
    expect(issues[0]?.message).toStartWith('Invalid LSP server config for ".lsp.json"');
    expect(issues[0]?.message).toContain('broken');
  });

  test('every invalid entry is reported, each with the prefix', () => {
    const { issues } = readLspConfig({ a: 1, b: { command: 'b' } }, '.lsp.json');
    expect(issues.map((found) => found.message.slice(0, 41))).toEqual([
      'Invalid LSP server config for ".lsp.json"',
      'Invalid LSP server config for ".lsp.json"',
    ]);
  });

  test('a file that is not a JSON object is an error', () => {
    for (const bad of [[], 'gopls', 3, null]) {
      const { servers, issues } = readLspConfig(bad, '.lsp.json');
      expect(servers).toEqual({});
      expect(issues).toHaveLength(1);
      expect(issues[0]?.message).toStartWith('Invalid LSP server config for ".lsp.json"');
    }
  });

  test('an empty file declares no servers and no issues', () => {
    expect(readLspConfig({}, '.lsp.json')).toEqual({ servers: {}, issues: [] });
  });

  test('a server named __proto__ stays an ordinary entry', () => {
    const raw: unknown = JSON.parse(`{"__proto__": ${JSON.stringify(gopls)}}`);
    const { servers } = readLspConfig(raw, '.lsp.json');
    expect(Object.keys(servers)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(servers)).toBe(Object.prototype);
  });
});

describe('mergeLspSources (components.md: a later server replaces an earlier one; judgment: whole entries)', () => {
  test('the manifest server replaces the .lsp.json one of the same name, and others add', () => {
    const merged = mergeLspSources([
      { servers: { go: server('gopls'), py: server('pyright') }, issues: [] },
      part('go', 'gopls-nightly'),
      part('rs', 'rust-analyzer'),
    ]);
    expect(merged.servers.go?.command).toBe('gopls-nightly');
    expect(Object.keys(merged.servers).toSorted()).toEqual(['go', 'py', 'rs']);
  });

  test('replacement is of the whole entry, never a field-wise merge', () => {
    const merged = mergeLspSources([
      { servers: { go: { ...server('gopls'), args: ['serve'], diagnostics: false } }, issues: [] },
      part('go', 'gopls'),
    ]);
    expect(merged.servers.go).toEqual(server('gopls'));
  });

  test('keeps the position of the first registration, so the first server keeps an extension', () => {
    const merged = mergeLspSources([
      { servers: { a: server('a'), b: server('b') }, issues: [] },
      part('a', 'a2'),
    ]);
    expect(Object.keys(merged.servers)).toEqual(['a', 'b']);
  });

  test('issues of every source are kept in order', () => {
    const merged = mergeLspSources([
      { servers: {}, issues: [issue('one')] },
      { servers: {}, issues: [issue('two')] },
    ]);
    expect(merged.issues.map((found) => found.message)).toEqual(['one', 'two']);
  });

  test('nothing to merge is empty', () => {
    expect(mergeLspSources([])).toEqual({ servers: {}, issues: [] });
  });
});
