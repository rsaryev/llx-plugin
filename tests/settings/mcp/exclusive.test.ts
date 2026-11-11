/**
 * managed-mcp.md § "Exclusive control with managed-mcp.json": with the file "Claude Code loads only"
 * its servers and those of `managedMcpServers` (plus the app's in-process servers and, if allowed,
 * Claude in Chrome); "Users can't add, modify, or use any other MCP servers, including
 * plugin-provided servers and servers passed with the `--mcp-config` CLI flag". § "Disable MCP
 * entirely": an empty server map blocks every other server; `claude mcp add` "fails with the
 * enterprise-policy error". § "Servers passed with `--mcp-config` or `--strict-mcp-config`", §
 * "Allow claude.ai connectors alongside the managed set", § "Allow Claude in Chrome alongside the
 * managed set", § "How allowlists and denylists apply to the managed set".
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
} from '../../support/mcp-managed.ts';
import { spec } from '../../support/spec.ts';
import {
  CHROME_BLOCKED_ERROR,
  EXCLUSIVE_ADD_ERROR,
  MCP_CONFIG_EXIT,
  STRICT_MCP_CONFIG_EXIT,
} from '../../../src/settings/mcp/exclusive.ts';

const file = { servers: { github: http('https://api.githubcopilot.com/mcp/') } };
const empty = { servers: {} };
const search = provided('search', 'https://search.example.com/mcp');
const users = [
  configured('local', 'mine'),
  configured('project', 'shared'),
  configured('user', 'notes'),
  configured('plugin', 'plugin-search'),
  configured('connector', 'claude.ai Slack'),
];

spec('mcpSettings.managed.Disable MCP entirely', () => {
  test('an empty server map loads no configured, plugin or connector server', () => {
    const plan = planOf({ managedFile: empty, candidates: users });
    expect(plan.exclusive).toBe(true);
    expect(plan.servers).toEqual([]);
  });

  test('servers provided through managedMcpServers still load under an empty map', () => {
    const plan = planOf({ managedFile: empty, managedServers: [search], candidates: users });
    expect(plannedLabels(plan)).toEqual(['managedSettings:search']);
  });

  test('`claude mcp add` fails with the enterprise-policy error', () => {
    expect(EXCLUSIVE_ADD_ERROR).toBe(
      'Cannot add MCP server: enterprise MCP configuration is active and has exclusive control over MCP servers',
    );
    expect(planOf({ managedFile: empty }).addError).toBe(EXCLUSIVE_ADD_ERROR);
  });

  test('without a readable file nothing is blocked and `claude mcp add` is not refused', () => {
    const plan = planOf({ managedFile: undefined, candidates: users });
    expect(plan.exclusive).toBe(false);
    expect(plan.addError).toBeUndefined();
    expect(plannedNames(plan)).toEqual([
      'claude.ai Slack',
      'mine',
      'notes',
      'plugin-search',
      'shared',
    ]);
  });
});

spec('mcpSettings.managed.Servers passed with --mcp-config or --strict-mcp-config', () => {
  const extra = [{ name: 'extra', server: http('https://extra.example.com/mcp') }];

  test('on a workstation --mcp-config exits at startup with the quoted message', () => {
    expect(MCP_CONFIG_EXIT).toBe(
      'You cannot dynamically configure MCP servers when an enterprise MCP config is present',
    );
    const plan = planOf({ managedFile: file, session: { cloud: false, mcpConfig: extra } });
    expect(plan.exit).toBe(MCP_CONFIG_EXIT);
    expect(plan.servers).toEqual([]);
  });

  test('in a cloud session the managed servers load alone and the skipped ones are named in a warning', () => {
    const delivered = [
      ...extra,
      { name: 'claude.ai Slack', server: http('https://slack.example.com/mcp') },
    ];
    const plan = planOf({
      managedFile: file,
      managedServers: [search],
      session: { cloud: true, mcpConfig: delivered },
    });
    expect(plan.exit).toBeUndefined();
    expect(plannedNames(plan)).toEqual(['github', 'search']);
    expect(plan.skipped).toEqual(['extra', 'claude.ai Slack']);
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0]).toContain('extra');
    expect(plan.warnings[0]).toContain('claude.ai Slack');
  });

  test('--strict-mcp-config exits on a workstation and in a cloud session alike', () => {
    for (const cloud of [false, true]) {
      const plan = planOf({ managedFile: file, session: { cloud, strictMcpConfig: true } });
      expect(plan.exit).toBe(STRICT_MCP_CONFIG_EXIT);
      expect(plan.servers).toEqual([]);
    }
  });

  test('a file Claude Code cannot read takes no control: the flags work as they do without it', () => {
    const plan = planOf({ managedFile: undefined, session: { cloud: false, mcpConfig: extra } });
    expect(plan.exit).toBeUndefined();
    expect(plannedLabels(plan)).toEqual(['flag:extra']);
    const strict = planOf({
      managedFile: undefined,
      session: { cloud: false, strictMcpConfig: true },
    });
    expect(strict.exit).toBeUndefined();
  });

  test('a cloud session without the file keeps the servers the host delivers', () => {
    const plan = planOf({ session: { cloud: true, mcpConfig: extra } });
    expect(plannedNames(plan)).toEqual(['extra']);
    expect(plan.warnings).toEqual([]);
  });
});

spec('mcpSettings.managed.Allow claude.ai connectors alongside the managed set', () => {
  const connectors = [
    configured('connector', 'claude.ai Slack'),
    configured('connector', 'claude.ai Linear'),
  ];
  const mixed = [...connectors, configured('plugin', 'plugin-search'), configured('user', 'notes')];
  const allowed = { ...NO_SETTINGS, allowAllClaudeAiMcps: true };

  test('by default the file suppresses the connectors Claude Code fetches itself', () => {
    const plan = planOf({ managedFile: file, candidates: connectors });
    expect(plannedNames(plan)).toEqual(['github']);
  });

  test('allowAllClaudeAiMcps loads them next to the file; plugin and user servers stay suppressed', () => {
    const plan = planOf({ managedFile: file, candidates: mixed, settings: allowed });
    expect(plannedNames(plan)).toEqual(['claude.ai Linear', 'claude.ai Slack', 'github']);
  });

  test('the denylist still applies to those connectors', () => {
    const policy = policyOf([['user', { deniedMcpServers: [{ serverName: 'claude.ai Slack' }] }]]);
    const plan = planOf({ managedFile: file, candidates: connectors, settings: allowed, policy });
    expect(plannedNames(plan)).toEqual(['claude.ai Linear', 'github']);
    expect(plan.blocked.map((each) => each.name)).toEqual(['claude.ai Slack']);
  });

  test('the allowlist still applies to those connectors', () => {
    const policy = policyOf([
      ['managed', { allowedMcpServers: [{ serverUrl: 'https://linear.example.com/*' }] }],
    ]);
    const linear = configured(
      'connector',
      'claude.ai Linear',
      http('https://linear.example.com/mcp'),
    );
    const slack = configured('connector', 'claude.ai Slack', http('https://slack.example.com/mcp'));
    const plan = planOf({
      managedFile: file,
      candidates: [linear, slack],
      settings: allowed,
      policy,
    });
    expect(plannedNames(plan)).toEqual(['claude.ai Linear', 'github']);
  });

  test('without the file the setting changes nothing: connectors load as usual', () => {
    expect(plannedNames(planOf({ candidates: connectors, settings: allowed }))).toEqual([
      'claude.ai Linear',
      'claude.ai Slack',
    ]);
  });

  test('a file on the host of a cloud session suppresses its connectors whether or not the setting is on', () => {
    const delivered = [{ name: 'claude.ai Slack', server: http('https://slack.example.com/mcp') }];
    const plan = planOf({
      managedFile: file,
      candidates: connectors,
      settings: allowed,
      session: { cloud: true, mcpConfig: delivered },
    });
    expect(plannedNames(plan)).toEqual(['github']);
    expect(plan.skipped).toEqual(['claude.ai Slack']);
  });
});

spec('mcpSettings.managed.Allow Claude in Chrome alongside the managed set', () => {
  const flagged = { flag: true, byDefault: false };
  const byDefault = { flag: false, byDefault: true };
  const allowed = { ...NO_SETTINGS, allowClaudeInChromeWithManagedMcp: true };

  test('claude --chrome exits at startup with an error that names the setting', () => {
    expect(CHROME_BLOCKED_ERROR).toBe(
      "Claude in Chrome is blocked by your organization's managed MCP configuration (managed-mcp.json). An administrator can allow it with allowClaudeInChromeWithManagedMcp in device policy.",
    );
    const plan = planOf({ managedFile: file, session: { cloud: false, chrome: flagged } });
    expect(plan.exit).toBe(CHROME_BLOCKED_ERROR);
    expect(plan.exit).toContain('allowClaudeInChromeWithManagedMcp');
  });

  test('Chrome turned on by default starts without it and prints no warning', () => {
    const plan = planOf({ managedFile: file, session: { cloud: false, chrome: byDefault } });
    expect(plan.exit).toBeUndefined();
    expect(plan.chrome).toBe(false);
    expect(plan.warnings).toEqual([]);
  });

  test('the setting lets Chrome run next to the managed set', () => {
    for (const chrome of [flagged, byDefault]) {
      const plan = planOf({
        managedFile: file,
        settings: allowed,
        session: { cloud: false, chrome },
      });
      expect(plan.exit).toBeUndefined();
      expect(plan.chrome).toBe(true);
    }
  });

  test('a denylist entry for claude-in-chrome still blocks it with the setting on', () => {
    const policy = policyOf([['user', { deniedMcpServers: [{ serverName: 'claude-in-chrome' }] }]]);
    const plan = planOf({
      managedFile: file,
      settings: allowed,
      policy,
      session: { cloud: false, chrome: byDefault },
    });
    expect(plan.chrome).toBe(false);
  });

  test('a user who could not run Claude in Chrome gets no error: the host passes no chrome facts', () => {
    const plan = planOf({ managedFile: file, session: { cloud: false } });
    expect(plan.exit).toBeUndefined();
    expect(plan.chrome).toBe(false);
  });
});

describe('exclusive control judgments', () => {
  // Judgment (spec/judgments.md): the wording of the --strict-mcp-config exit and of the cloud
  // warning, which the page describes without quoting; without the file Chrome is not this module's
  // to block; the Chrome server is matched by its name only; a denied managed server is reported.
  test('--strict-mcp-config has an exit message that names the flag', () => {
    expect(STRICT_MCP_CONFIG_EXIT).toContain('--strict-mcp-config');
  });

  test('without the file Chrome runs when the user wants it', () => {
    const plan = planOf({ session: { cloud: false, chrome: { flag: true, byDefault: false } } });
    expect(plan.chrome).toBe(true);
    expect(plan.exit).toBeUndefined();
  });

  test('without the file a denylist entry for claude-in-chrome blocks it', () => {
    const policy = policyOf([['user', { deniedMcpServers: [{ serverName: 'claude-in-chrome' }] }]]);
    const plan = planOf({
      policy,
      session: { cloud: false, chrome: { flag: true, byDefault: false } },
    });
    expect(plan.chrome).toBe(false);
  });

  test('deniedMcpServers filters the servers of the file too, and the report names why', () => {
    const policy = policyOf([['user', { deniedMcpServers: [{ serverName: 'github' }] }]]);
    const plan = planOf({ managedFile: file, managedServers: [search], policy });
    expect(plannedNames(plan)).toEqual(['search']);
    expect(plan.blocked.map((each) => `${each.source}:${each.name}`)).toEqual([
      'managedFile:github',
    ]);
  });
});
