/**
 * managed-mcp.md § "Where `managedMcpServers` applies": Claude Code reads the key "from the managed
 * source it selects"; when that source sets `managedSourcesBehavior` to `"merge"` it "provides the
 * servers from every admin source instead, and when two sources define the same name, the
 * higher-ranked source's entry applies whole. It never reads the key from the user-writable HKCU
 * registry, from parent settings an embedding host supplies, or from user, project, or local settings
 * files, where it drops the key with a warning." The choice of managed source is the host's; the kit
 * reads the managed layers it is given (rank only: what an entry may contain is judged elsewhere).
 * "Claude Code doesn't read the key in the Claude Desktop app's Code tab on a third-party deployment
 * or in the app's Cowork sessions, because Claude Desktop supplies and locks those sessions' MCP
 * servers itself. `/status` and `claude doctor` say so when your managed settings carry the key there."
 */
import { describe, expect, test } from 'bun:test';
import { managedServerEntries } from '../../../src/settings/mcp/index.ts';
import type { PolicyLayer, PolicyScope } from '../../../src/settings/index.ts';
import { spec } from '../../support/spec.ts';

const search = { type: 'http', url: 'https://search.example.com/mcp' };
const records = {
  type: 'http',
  url: 'https://records.example.com/mcp',
  headers: { 'X-Records-Key': 'key-issued-for-all-claude-code-users' },
};

const layer = (scope: PolicyScope, servers: object): PolicyLayer => ({
  scope,
  settings: { managedMcpServers: Object.fromEntries(Object.entries(servers)) },
});

spec('mcpSettings.managed.Where managedMcpServers applies', () => {
  test('a managed layer provides its entries, the docs example', () => {
    const { entries, issues } = managedServerEntries([layer('managed', { search, records })]);
    expect(entries).toEqual({ search, records });
    expect(issues).toEqual([]);
  });

  test('with several admin sources the names union and a name both define takes the higher source whole', () => {
    const high = { type: 'http', url: 'https://high.example.com/mcp' };
    const low = { type: 'sse', url: 'https://low.example.com/sse' };
    const { entries } = managedServerEntries([
      layer('managed', { search: high }),
      layer('managed', { search: low, records }),
    ]);
    expect(entries).toEqual({ search: high, records });
  });

  test('user, project, local, --settings, parent and --add-dir settings drop the key with a warning', () => {
    for (const scope of ['user', 'project', 'local', 'flag', 'parent', 'addDir'] as const) {
      const { entries, issues } = managedServerEntries([layer(scope, { search })]);
      expect(entries).toEqual({});
      expect(issues).toHaveLength(1);
      expect(issues[0]?.severity).toBe('warning');
      expect(issues[0]?.path).toBe(`${scope}:managedMcpServers`);
    }
  });

  test('the Desktop Code tab on a third-party deployment and Cowork sessions read no managed entry and say so', () => {
    for (const desktopManaged of ['third-party', 'cowork'] as const) {
      const { entries, issues } = managedServerEntries([layer('managed', { search })], {
        desktopManaged,
      });
      expect(entries).toEqual({});
      expect(issues).toHaveLength(1);
      expect(issues[0]?.severity).toBe('warning');
      expect(issues[0]?.path).toBe('managed:managedMcpServers');
    }
  });

  test('a Desktop session whose managed settings do not carry the key says nothing', () => {
    expect(
      managedServerEntries([{ scope: 'managed', settings: {} }], { desktopManaged: 'cowork' }),
    ).toEqual({ entries: {}, issues: [] });
  });

  test('a managed entry is not affected by another scope also naming the key', () => {
    const { entries, issues } = managedServerEntries([
      layer('managed', { search }),
      layer('user', { search: { type: 'http', url: 'https://evil.example.com/mcp' } }),
    ]);
    expect(entries).toEqual({ search });
    expect(issues).toHaveLength(1);
  });
});

describe('managed source judgments', () => {
  // Judgment (spec/judgments.md): a managed value that is no object holds no entries and no issue
  // here; judging the value is the entry validation's, not the choice of source.
  test('a managed value that is no object provides nothing', () => {
    expect(
      managedServerEntries([
        { scope: 'managed', settings: Object.fromEntries([['managedMcpServers', 7]]) },
      ]).entries,
    ).toEqual({});
  });

  test('a layer without the key says nothing', () => {
    expect(managedServerEntries([{ scope: 'user', settings: {} }])).toEqual({
      entries: {},
      issues: [],
    });
  });
});
