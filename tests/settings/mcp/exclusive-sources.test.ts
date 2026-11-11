/**
 * managed-mcp.md § "Disable MCP entirely" (servers you provide "and anything else you allow
 * alongside the managed set, still load under an empty map"), § "Allow claude.ai connectors
 * alongside the managed set", § "How allowlists and denylists apply to the managed set" (a file
 * server is checked only when it uses `${VAR}` expansion outside `env`), § "How provided servers
 * load" ("the file's entry takes precedence when both define a name"), § "What users can see and
 * change" (`/mcp` toggles of provided servers), § "Where `managedMcpServers` applies" (the Desktop
 * sessions that read no entry), § "Servers passed with `--mcp-config` or `--strict-mcp-config`".
 */
import { describe, expect, test } from 'bun:test';

import { policyOf } from '../../support/mcp-policy.ts';
import {
  NO_SETTINGS,
  configured,
  http,
  planOf,
  plannedLabels,
  plannedNames,
  provided,
  resolvedOnDevice,
} from '../../support/mcp-managed.ts';
import { spec } from '../../support/spec.ts';
import { MCP_CONFIG_EXIT, STRICT_MCP_CONFIG_EXIT } from '../../../src/settings/mcp/exclusive.ts';

const file = { servers: { github: http('https://api.githubcopilot.com/mcp/') } };
const empty = { servers: {} };
const search = provided('search', 'https://search.example.com/mcp');
const slack = configured('connector', 'claude.ai Slack');
const others = [slack, configured('user', 'notes'), configured('plugin', 'plugin-search')];

spec('mcpSettings.managed.Disable MCP entirely', () => {
  test('allowAllClaudeAiMcps lets the connectors load under an empty map; nothing else does', () => {
    const plan = planOf({
      managedFile: empty,
      candidates: others,
      settings: { ...NO_SETTINGS, allowAllClaudeAiMcps: true },
    });
    expect(plannedNames(plan)).toEqual(['claude.ai Slack']);
  });

  test('allowClaudeInChromeWithManagedMcp lets Claude in Chrome run under an empty map', () => {
    const session = { cloud: false, chrome: { flag: false, byDefault: true } };
    expect(planOf({ managedFile: empty, session }).chrome).toBe(false);
    const allowed = { ...NO_SETTINGS, allowClaudeInChromeWithManagedMcp: true };
    const plan = planOf({ managedFile: empty, settings: allowed, session });
    expect(plan.chrome).toBe(true);
    expect(plan.servers).toEqual([]);
  });
});

spec('mcpSettings.managed.Allow claude.ai connectors alongside the managed set', () => {
  test('disableClaudeAiConnectors still drops the connectors when allowAllClaudeAiMcps is on', () => {
    const settings = {
      ...NO_SETTINGS,
      allowAllClaudeAiMcps: true,
      disableClaudeAiConnectors: true,
    };
    const plan = planOf({ managedFile: file, candidates: others, settings });
    expect(plannedNames(plan)).toEqual(['github']);
  });
});

spec('mcpSettings.managed.How allowlists and denylists apply to the managed set', () => {
  const listed = policyOf([
    ['managed', { allowedMcpServers: [{ serverUrl: 'https://listed.example.com/*' }] }],
  ]);

  test('with an allowlist a file server using ${VAR} in its url is blocked and one without loads', () => {
    const managedFile = {
      servers: {
        templated: http('https://${TENANT}.example.com/mcp'),
        literal: http('https://api.githubcopilot.com/mcp/'),
      },
    };
    const plan = planOf({ managedFile, policy: listed });
    expect(plannedLabels(plan)).toEqual(['managedFile:literal']);
    expect(plan.blocked.map((each) => `${each.source}:${each.name}`)).toEqual([
      'managedFile:templated',
    ]);
  });

  test('a provided server never meets the allowlist', () => {
    const plan = planOf({ managedServers: [search], policy: listed });
    expect(plannedLabels(plan)).toEqual(['managedSettings:search']);
  });
});

spec('mcpSettings.managed.How provided servers load', () => {
  test("the file's entry wins a name both define, and the allowlist treats it as the file's", () => {
    const listed = policyOf([
      ['managed', { allowedMcpServers: [{ serverUrl: 'https://listed.example.com/*' }] }],
    ]);
    const managedFile = { servers: { shared: http('https://file.example.com/mcp') } };
    const plan = planOf({
      managedFile,
      managedServers: [provided('shared', 'https://provided.example.com/mcp')],
      policy: listed,
    });
    expect(plannedLabels(plan)).toEqual(['managedFile:shared']);
    expect(plan.blocked).toEqual([]);
    expect(plan.hidden).toHaveLength(1);
  });
});

spec('mcpSettings.managed.Where managedMcpServers applies', () => {
  const policy = resolvedOnDevice([
    [
      'managed',
      { managedMcpServers: { search: { type: 'http', url: 'https://search.example.com/mcp' } } },
    ],
  ]);
  const facts = { candidates: [], session: { cloud: false } };

  test('loadPlan provides the servers of the managed layers', () => {
    expect(plannedLabels(policy.mcp.loadPlan(facts))).toEqual(['managedSettings:search']);
  });

  test('a Desktop session that supplies its own servers reads no entry', () => {
    for (const desktopManaged of ['third-party', 'cowork'] as const) {
      expect(policy.mcp.loadPlan({ ...facts, desktopManaged }).servers).toEqual([]);
    }
  });
});

describe('exclusive control judgments, sources and order', () => {
  // Judgment (spec/judgments.md): when several startup exits apply the one the page lists first
  // wins (`--mcp-config`, then `--strict-mcp-config`); `/mcp` toggles apply to provided servers and
  // the open scopes, never to the servers of `managed-mcp.json`.
  test('with both flags on a workstation the --mcp-config message is the one', () => {
    const extra = [{ name: 'extra', server: http('https://extra.example.com/mcp') }];
    const session = { cloud: false, mcpConfig: extra, strictMcpConfig: true };
    expect(planOf({ managedFile: file, session }).exit).toBe(MCP_CONFIG_EXIT);
  });

  test('in a cloud session --mcp-config is skipped, so --strict-mcp-config gives the message', () => {
    const extra = [{ name: 'extra', server: http('https://extra.example.com/mcp') }];
    const session = { cloud: true, mcpConfig: extra, strictMcpConfig: true };
    expect(planOf({ managedFile: file, session }).exit).toBe(STRICT_MCP_CONFIG_EXIT);
  });

  test('a /mcp toggle turns a provided server off and leaves a file server on', () => {
    const toggles = { disabledMcpServers: ['github', 'search'], enabledMcpServers: [] };
    const plan = planOf({ managedFile: file, managedServers: [search], toggles });
    const enabled = plan.servers.map((each) => `${each.name}:${each.enabled}`).toSorted();
    expect(enabled).toEqual(['github:true', 'search:false']);
  });
});
