/**
 * managed-mcp.md § "How provided servers load": "A provided server takes precedence over a server
 * with the same name in local, project, or user scope, and over a plugin server or claude.ai
 * connector that points at the same URL"; "If you also deploy `managed-mcp.json`, Claude Code loads
 * its servers and the provided servers together, and the file's entry takes precedence when both
 * define a name"; "Provided servers keep loading when `strictPluginOnlyCustomization` locks the `mcp`
 * surface"; "`deniedMcpServers` applies to provided servers, including entries from a user's own
 * settings ... Provided servers need no `allowedMcpServers` entry"; without the file, "A server a
 * user passes with `--mcp-config` under the same name replaces the provided one for that run and is
 * checked against `allowedMcpServers`" and "`--strict-mcp-config` leaves provided servers out along
 * with every other configured server". § "What users can see and change": `claude mcp remove`
 * reports the server "is provided by the organization" (the table of "How restrictions appear to
 * users" quotes it); "an entry a user adds under the same name is saved but not used while yours is
 * present"; users "can still turn a provided server off for themselves in `/mcp`, which lists provided
 * servers under **Managed MCPs**"; `claude mcp get` and `/mcp` show "the URL's host only" and header
 * names without values.
 */
import { expect, test } from 'bun:test';
import {
  MANAGED_MCP_GROUP,
  describeManagedServer,
  managedServerRemoval,
} from '../../../src/settings/mcp/index.ts';
import { policyOf } from '../../support/mcp-policy.ts';
import {
  NO_SETTINGS,
  configured,
  http,
  planOf,
  plannedLabels,
  plannedNames,
  provided,
} from '../../support/mcp-managed.ts';
import { spec } from '../../support/spec.ts';

const search = provided('search', 'https://search.example.com/mcp');

spec('mcpSettings.managed.How provided servers load', () => {
  test('a provided server beats local, project and user servers of its name', () => {
    const plan = planOf({
      managedServers: [search],
      candidates: [
        configured('local', 'search', http('https://local.example.com/mcp')),
        configured('project', 'search', http('https://project.example.com/mcp')),
        configured('user', 'search', http('https://user.example.com/mcp')),
      ],
    });
    expect(plannedLabels(plan)).toEqual(['managedSettings:search']);
    expect(plan.servers[0]?.server).toEqual(http('https://search.example.com/mcp'));
    expect(plan.hidden).toHaveLength(3);
  });

  test('a provided server beats a plugin server and a connector at the same URL', () => {
    const url = 'https://search.example.com/mcp';
    const plan = planOf({
      managedServers: [search],
      candidates: [
        configured('plugin', 'p', http(url)),
        configured('connector', 'claude.ai Search', http(url)),
      ],
    });
    expect(plannedLabels(plan)).toEqual(['managedSettings:search']);
  });

  test('with managed-mcp.json both sets load together and the file wins a shared name', () => {
    const fileEntry = http('https://from-file.example.com/mcp');
    const plan = planOf({
      managedFile: {
        servers: { search: fileEntry, github: http('https://api.githubcopilot.com/mcp/') },
      },
      managedServers: [search, provided('records', 'https://records.example.com/mcp')],
    });
    expect(plannedLabels(plan)).toEqual([
      'managedFile:search',
      'managedFile:github',
      'managedSettings:records',
    ]);
    expect(plan.servers[0]?.server).toEqual(fileEntry);
  });

  test('strictPluginOnlyCustomization with mcp closes the user files and keeps the provided server', () => {
    const plan = planOf({
      managedServers: [search],
      candidates: [
        configured('user', 'notes'),
        configured('project', 'shared'),
        configured('plugin', 'p'),
      ],
      settings: { ...NO_SETTINGS, pluginOnlyMcp: true },
    });
    expect(plannedLabels(plan)).toEqual(['managedSettings:search', 'plugin:p']);
  });

  test("deniedMcpServers blocks a provided server, from managed settings or from the user's own", () => {
    for (const scope of ['managed', 'user'] as const) {
      const policy = policyOf([[scope, { deniedMcpServers: [{ serverName: 'search' }] }]]);
      const plan = planOf({
        managedServers: [search, provided('records', 'https://r.example.com/mcp')],
        policy,
      });
      expect(plannedNames(plan)).toEqual(['records']);
      expect(plan.blocked.map((each) => each.name)).toEqual(['search']);
    }
  });

  test('a provided server needs no allowedMcpServers entry, even under an empty allowlist', () => {
    const policy = policyOf([
      ['managed', { allowedMcpServers: [], allowManagedMcpServersOnly: true }],
    ]);
    const plan = planOf({
      managedServers: [search],
      candidates: [configured('user', 'notes')],
      policy,
    });
    expect(plannedNames(plan)).toEqual(['search']);
    expect(plan.blocked.map((each) => each.name)).toEqual(['notes']);
  });

  test('without the file, a --mcp-config server of the same name replaces it for the run and meets the allowlist', () => {
    const own = { name: 'search', server: http('https://own.example.com/mcp') };
    const plan = planOf({ managedServers: [search], session: { cloud: false, mcpConfig: [own] } });
    expect(plannedLabels(plan)).toEqual(['flag:search']);
    expect(plan.servers[0]?.server).toEqual(own.server);
    const policy = policyOf([
      ['managed', { allowedMcpServers: [{ serverUrl: 'https://ok.example.com/*' }] }],
    ]);
    const checked = planOf({
      managedServers: [search],
      policy,
      session: { cloud: false, mcpConfig: [own] },
    });
    expect(plannedNames(checked)).toEqual([]);
    expect(checked.blocked.map((each) => `${each.source}:${each.name}`)).toEqual(['flag:search']);
  });

  test('without the file, --strict-mcp-config leaves provided servers out with every other configured server', () => {
    const plan = planOf({
      managedServers: [search],
      candidates: [configured('user', 'notes'), configured('plugin', 'p')],
      session: {
        cloud: false,
        strictMcpConfig: true,
        mcpConfig: [{ name: 'run', server: http('https://run.example.com/mcp') }],
      },
    });
    expect(plannedLabels(plan)).toEqual(['flag:run']);
  });
});

spec('mcpSettings.managed.What users can see and change', () => {
  test('claude mcp remove reports that the organization provides the server', () => {
    expect(managedServerRemoval('search')).toBe(
      'MCP server "search" is provided by your organization (managed settings) and cannot be removed locally.',
    );
  });

  test('without the file a user entry under the same name is not used while the provided one is present', () => {
    const user = configured('user', 'search', http('https://mine.example.com/mcp'));
    const plan = planOf({ managedServers: [search], candidates: [user] });
    expect(plannedLabels(plan)).toEqual(['managedSettings:search']);
    expect(plan.hidden.map((each) => each.candidate.scope)).toEqual(['user']);
  });

  test('a user can turn a provided server off for themselves: it stays listed, disabled', () => {
    const plan = planOf({
      managedServers: [search, provided('records', 'https://r.example.com/mcp')],
      toggles: { disabledMcpServers: ['search'], enabledMcpServers: [] },
    });
    expect(plan.servers.map((each) => `${each.name}:${each.enabled}`)).toEqual([
      'search:false',
      'records:true',
    ]);
    expect(MANAGED_MCP_GROUP).toBe('Managed MCPs');
  });

  test('claude mcp get and /mcp show the URL host only and header names without values', () => {
    const shown = describeManagedServer({
      type: 'http',
      url: 'https://mcp.example.com/v1/tools?x=1',
      headers: { 'X-Records-Key': 'key-issued-for-all-claude-code-users' },
    });
    expect(shown).toEqual({
      group: 'Managed MCPs',
      url: 'https://mcp.example.com/…',
      headerNames: ['X-Records-Key'],
    });
    expect(JSON.stringify(shown)).not.toContain('key-issued');
  });
});
