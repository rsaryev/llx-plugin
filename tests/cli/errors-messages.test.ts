/**
 * errors.md: the messages Claude Code prints for a handful of failures, each in the form the page
 * quotes. Sections: "Has a wildcard before the rest of the command", "Plugin is required by your
 * organization", "MCP server is blocked by enterprise managed policy", "Failed to load marketplace
 * configuration", "Marketplace entry path does not stay inside the marketplace directory"
 * (plugins/troubleshooting.md), "Workspace has not been trusted", "MCP permission prompt tool not
 * found".
 */
import { expect, test } from 'bun:test';
import { planDisable } from '../../src/cli/disable-plan.ts';
import { permissionPromptToolNotFound } from '../../src/format/mcp-contract.ts';
import { untrustedWorkspaceWarning } from '../../src/loading/index.ts';
import { pluginRootIssue } from '../../src/marketplace/copy-plan.ts';
import { parseKnownMarketplaces } from '../../src/marketplace/known-marketplaces.ts';
import { DOCUMENTED_TOOLS } from '../../src/protocol/tool-names.ts';
import { ruleIssues, wildcardBannerRow } from '../../src/rules/index.ts';
import { loads, policyOf, stdio, verdictOf } from '../support/mcp-policy.ts';
import { parsed } from '../support/rule-context.ts';
import { human, settingsOnly } from '../support/toggle.ts';
import { spec } from '../support/spec.ts';

const E = 'cli.errors.';

spec(`${E}Has a wildcard before the rest of the command`, () => {
  const rule = parsed('Bash(git -C * status *)', 'allow', { kind: 'project' });

  test('the warning names the source in parentheses and the rule, and advises on git', () => {
    const [issue] = ruleIssues([rule], new Set(DOCUMENTED_TOOLS));
    expect(issue?.severity).toBe('warning');
    expect(issue?.message).toBe(
      'Permission allow rule (.claude/settings.json): Bash(git -C * status *) has a wildcard before the rest of the command, so it also matches any options inserted at that position and approves them without a prompt. For git, options such as -c and --exec-path can run arbitrary commands. Replace that * with the exact value you mean, or only use * after the subcommand (for example Bash(git status *)).',
    );
  });

  test('an --allowed-tools rule names the flag as its source', () => {
    const flagged = parsed('Bash(git * main)', 'allow', { kind: 'cli' });
    expect(ruleIssues([flagged], new Set(DOCUMENTED_TOOLS))[0]?.message).toStartWith(
      'Permission allow rule (--allowed-tools): Bash(git * main) has a wildcard',
    );
  });

  test('an interactive session shows one row below the banner', () => {
    expect(wildcardBannerRow(rule)).toBe(
      '⚠ Allow rule Bash(git -C * status *) allows any option at its * · use an exact value',
    );
  });
});

spec(`${E}Plugin is required by your organization`, () => {
  test('disabling a required synced plugin saves nothing and says so', () => {
    const graph = settingsOnly({ user: { 'formatter@synced': true } });
    const plan = planDisable(
      { plugin: 'formatter@synced' },
      { graph, requiredByOrganization: new Set(['formatter@synced']) },
    );
    expect(plan.writes).toEqual([]);
    expect(human(plan).stderr[0]).toContain(
      'Plugin "formatter@synced" is required by your organization and can\'t be disabled here. Contact your admin to change it.',
    );
  });
});

spec(`${E}MCP server is blocked by enterprise managed policy`, () => {
  test('a reconnect to a denied server fails with the documented line', () => {
    const policy = policyOf([['managed', { deniedMcpServers: [{ serverName: 'bad' }] }]]);
    const verdict = verdictOf(policy, 'bad', stdio('x'));
    expect(verdict.allowed ? '' : verdict.reconnectError).toBe(
      'MCP server bad is blocked by enterprise managed policy',
    );
    expect(loads(policy, 'bad', stdio('x'))).toBe(false);
  });
});

spec(`${E}Failed to load marketplace configuration`, () => {
  test('an empty known_marketplaces.json fails with the documented line', () => {
    expect(parseKnownMarketplaces('').failure).toEqual({
      code: 'unreadable',
      message: 'Failed to load marketplace configuration: JSON Parse error: Unexpected EOF',
    });
  });
});

spec(`${E}Marketplace entry path does not stay inside the marketplace directory`, () => {
  test('a plugin directory that leaves its marketplace is refused', () => {
    const refused = pluginRootIssue({
      entryPath: './my-plugin',
      pluginRoot: '/elsewhere/my-plugin',
      marketplaceRoot: '/m',
    });
    expect(refused?.message).toBe(
      'Plugin source path refused: ./my-plugin does not stay inside its marketplace directory. Check that the marketplace entry has a plain relative path.',
    );
  });
});

spec(`${E}Workspace has not been trusted`, () => {
  test('the warning counts the entries and names the file and the projects key', () => {
    expect(
      untrustedWorkspaceWarning({
        count: 2,
        setting: 'permissions.allow',
        file: '.claude/settings.local.json',
        key: '/Users/you/project',
        claudeJson: '/Users/you/.claude.json',
      }),
    ).toBe(
      'Ignoring 2 permissions.allow entries from .claude/settings.local.json: this workspace has not been trusted. Run Claude Code interactively here once and accept the trust dialog, or set projects["/Users/you/project"].hasTrustDialogAccepted: true in /Users/you/.claude.json.',
    );
  });
});

spec(`${E}MCP permission prompt tool not found`, () => {
  test('names the tool and the connected MCP tools, or none', () => {
    expect(permissionPromptToolNotFound('mcp__permissions__approve', [])).toBe(
      'Error: MCP tool mcp__permissions__approve (passed via --permission-prompt-tool) not found. Available MCP tools: none',
    );
    expect(permissionPromptToolNotFound('mcp__p__x', ['mcp__a__b', 'mcp__c__d'])).toContain(
      'Available MCP tools: mcp__a__b, mcp__c__d',
    );
  });
});
