/**
 * settings-reference.md § `managedMcpServers` ("Scope: Managed. Claude Code drops the key with a
 * warning in user, project, and local settings"; an object keyed by server name; default unset),
 * § `allowAllClaudeAiMcps` ("Scope: Managed. Users can't re-enable connectors that exclusive control
 * suppressed"; Boolean, default `false`), § `allowClaudeInChromeWithManagedMcp` ("Managed, from the
 * device's own managed settings only: an MDM-deployed plist or HKLM registry key, or a system
 * `managed-settings.json` file. Claude Code ignores it in server-managed settings, in the
 * user-writable HKCU registry, and in user or project settings"; v2.1.282), § `disableClaudeAiConnectors`
 * ("Scope: Any file ... A `true` in any settings file applies ... a project-level `false` can't
 * override a user- or managed-level `true`"; `ENABLE_CLAUDEAI_MCP_SERVERS=false` "turns connectors off
 * for one session; whichever of the two turns them off, the other can't turn them back on"; "Servers
 * you pass explicitly with `--mcp-config` are unaffected"). managed-settings.md § "Keys read from
 * every admin source" lists `allowAllClaudeAiMcps`, `disableClaudeAiConnectors` and
 * `managedMcpServers` ("Combines the server names from every source").
 */
import { describe, expect, test } from 'bun:test';
import { KEY_SPECS } from '../../../src/settings/index.ts';
import { http } from '../../support/mcp-managed.ts';
import {
  configured,
  managedLayer,
  planOf,
  plannedNames,
  resolvedOnDevice,
} from '../../support/mcp-managed.ts';
import { issuesOf, layerOf } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const file = { servers: { github: http('https://api.githubcopilot.com/mcp/') } };
const slack = configured('connector', 'claude.ai Slack');
const facts = { managedFile: file, candidates: [slack], session: { cloud: false } };

/** The names a workstation with the file loads, given the settings the policy read. */
const loadedWith = (policy: ReturnType<typeof resolvedOnDevice>, over = {}) =>
  plannedNames(policy.mcp.loadPlan({ ...facts, ...over }));

describe("the four keys are policy keys with the docs' scope lines", () => {
  test('managed scope for three, any file for the connectors switch', () => {
    expect(KEY_SPECS.managedMcpServers.scopes).toBe('managed');
    expect(KEY_SPECS.allowAllClaudeAiMcps.scopes).toBe('managed');
    expect(KEY_SPECS.allowClaudeInChromeWithManagedMcp.scopes).toBe('managed');
    expect(KEY_SPECS.disableClaudeAiConnectors.scopes).toBe('any');
  });
});

spec('mcpSettings.key.managedMcpServers', () => {
  const entries = { search: { type: 'http', url: 'https://search.example.com/mcp' } };

  test('a managed layer keeps it; the docs example is an object keyed by server name', () => {
    expect(managedLayer({ managedMcpServers: entries }).settings).toEqual({
      managedMcpServers: entries,
    });
    expect(issuesOf('managed', { managedMcpServers: entries })).toEqual([]);
  });

  test('user, project and local settings drop it with a warning', () => {
    for (const scope of ['user', 'project', 'local'] as const) {
      expect(layerOf(scope, { managedMcpServers: entries }).settings).toEqual({});
      const issues = issuesOf(scope, { managedMcpServers: entries });
      expect(issues).toHaveLength(1);
      expect(issues[0]?.severity).toBe('warning');
      expect(issues[0]?.message).toContain('managedMcpServers');
    }
  });

  test("names combine across managed sources and the higher source's entry applies whole", () => {
    const higher = { type: 'sse', url: 'https://high.example.com/sse' };
    const policy = resolvedOnDevice([
      ['managed', { managedMcpServers: { search: higher } }],
      ['managed', { managedMcpServers: { search: entries.search, records: entries.search } }],
    ]);
    expect(KEY_SPECS.managedMcpServers.merge.kind).toBe('perKeyHighestWins');
    expect(
      policy.mcp.providedServers().servers.map((each) => `${each.name}:${each.server.type}`),
    ).toEqual(['search:sse', 'records:http']);
  });

  test('the load plan of a policy carries the provided servers, and unset provides none', () => {
    const withKey = resolvedOnDevice([['managed', { managedMcpServers: entries }]]);
    expect(
      plannedNames(withKey.mcp.loadPlan({ candidates: [], session: { cloud: false } })),
    ).toEqual(['search']);
    const without = resolvedOnDevice([['managed', {}]]);
    expect(
      plannedNames(without.mcp.loadPlan({ candidates: [], session: { cloud: false } })),
    ).toEqual([]);
  });
});

spec('mcpSettings.key.allowAllClaudeAiMcps', () => {
  test('true in any managed tier loads the connectors next to the file', () => {
    const policy = resolvedOnDevice([['managed', { allowAllClaudeAiMcps: true }]]);
    expect(loadedWith(policy)).toEqual(['claude.ai Slack', 'github']);
  });

  test('false and unset keep the suppression: the default is false', () => {
    expect(loadedWith(resolvedOnDevice([['managed', { allowAllClaudeAiMcps: false }]]))).toEqual([
      'github',
    ]);
    expect(loadedWith(resolvedOnDevice([['managed', {}]]))).toEqual(['github']);
    expect(resolvedOnDevice([]).mcp.loadSettings().allowAllClaudeAiMcps).toBe(false);
  });

  test('user, project, local and --settings files cannot re-enable the connectors', () => {
    for (const scope of ['user', 'project', 'local', 'flag'] as const) {
      expect(issuesOf(scope, { allowAllClaudeAiMcps: true })).toHaveLength(1);
      expect(loadedWith(resolvedOnDevice([[scope, { allowAllClaudeAiMcps: true }]]))).toEqual([
        'github',
      ]);
    }
  });

  test('a lower admin source can set it when the selected one does not (read from every admin source)', () => {
    const policy = resolvedOnDevice([
      ['managed', {}],
      ['managed', { allowAllClaudeAiMcps: true }],
    ]);
    expect(policy.mcp.loadSettings().allowAllClaudeAiMcps).toBe(true);
  });

  test('a value that is no Boolean is dropped with a warning', () => {
    const issues = issuesOf('managed', { allowAllClaudeAiMcps: 'yes' });
    expect(issues).toHaveLength(1);
    expect(layerOf('managed', { allowAllClaudeAiMcps: 'yes' }).settings).toEqual({});
  });
});

spec('mcpSettings.key.allowClaudeInChromeWithManagedMcp', () => {
  const chrome = { cloud: false, chrome: { flag: false, byDefault: true } };
  const runsChrome = (policy: ReturnType<typeof resolvedOnDevice>) =>
    policy.mcp.loadPlan({ managedFile: file, candidates: [], session: chrome }).chrome;
  const on = managedLayer({ allowClaudeInChromeWithManagedMcp: true });

  test("true in the device's own managed settings lets Chrome run next to the file", () => {
    expect(
      runsChrome(
        resolvedOnDevice([['managed', { allowClaudeInChromeWithManagedMcp: true }]], [on]),
      ),
    ).toBe(true);
  });

  test('server-managed settings alone do not: the key is read from the device sources only', () => {
    // The managed layer is there, the device has none of its own.
    const policy = resolvedOnDevice([['managed', { allowClaudeInChromeWithManagedMcp: true }]], []);
    expect(runsChrome(policy)).toBe(false);
    expect(policy.mcp.loadSettings().allowClaudeInChromeWithManagedMcp).toBe(false);
  });

  test('user, project and local settings are ignored', () => {
    for (const scope of ['user', 'project', 'local'] as const) {
      expect(issuesOf(scope, { allowClaudeInChromeWithManagedMcp: true })).toHaveLength(1);
      const device = [layerOf(scope, { allowClaudeInChromeWithManagedMcp: true })];
      expect(runsChrome(resolvedOnDevice([], device))).toBe(false);
    }
  });

  test('false and unset block Chrome in a terminal session: the default is false', () => {
    const off = managedLayer({ allowClaudeInChromeWithManagedMcp: false });
    expect(runsChrome(resolvedOnDevice([], [off]))).toBe(false);
    expect(runsChrome(resolvedOnDevice([], [managedLayer({})]))).toBe(false);
  });

  test('a value that is no Boolean is dropped with a warning', () => {
    expect(issuesOf('managed', { allowClaudeInChromeWithManagedMcp: 1 })).toHaveLength(1);
  });
});

spec('mcpSettings.key.disableClaudeAiConnectors', () => {
  const connectors = {
    candidates: [slack, configured('user', 'notes')],
    session: { cloud: false },
  };
  const loadedNames = (policy: ReturnType<typeof resolvedOnDevice>) =>
    plannedNames(policy.mcp.loadPlan(connectors));

  test('true in any settings file turns the connectors Claude Code fetches off', () => {
    for (const scope of ['user', 'project', 'local', 'flag', 'managed'] as const) {
      expect(loadedNames(resolvedOnDevice([[scope, { disableClaudeAiConnectors: true }]]))).toEqual(
        ['notes'],
      );
    }
  });

  test('false is the same as unset: the connectors load', () => {
    expect(loadedNames(resolvedOnDevice([['user', { disableClaudeAiConnectors: false }]]))).toEqual(
      ['claude.ai Slack', 'notes'],
    );
    expect(loadedNames(resolvedOnDevice([]))).toEqual(['claude.ai Slack', 'notes']);
  });

  test('a project-level false cannot override a user- or managed-level true', () => {
    for (const scope of ['user', 'managed'] as const) {
      const policy = resolvedOnDevice([
        [scope, { disableClaudeAiConnectors: true }],
        ['project', { disableClaudeAiConnectors: false }],
      ]);
      expect(loadedNames(policy)).toEqual(['notes']);
    }
  });

  test('a checked-in project file can opt the repository out', () => {
    expect(
      loadedNames(resolvedOnDevice([['project', { disableClaudeAiConnectors: true }]])),
    ).toEqual(['notes']);
  });

  test('ENABLE_CLAUDEAI_MCP_SERVERS=false does the same for the session and the setting cannot undo it', () => {
    const env = { ENABLE_CLAUDEAI_MCP_SERVERS: 'false' };
    expect(loadedNames(resolvedOnDevice([], [], { env }))).toEqual(['notes']);
    expect(
      loadedNames(resolvedOnDevice([['user', { disableClaudeAiConnectors: false }]], [], { env })),
    ).toEqual(['notes']);
  });

  test('servers passed with --mcp-config are unaffected', () => {
    const policy = resolvedOnDevice([['user', { disableClaudeAiConnectors: true }]]);
    const plan = policy.mcp.loadPlan({
      candidates: [slack],
      session: {
        cloud: false,
        mcpConfig: [{ name: 'run', server: http('https://run.example.com/mcp') }],
      },
    });
    expect(plannedNames(plan)).toEqual(['run']);
  });

  test('a text instead of a Boolean in managed settings fails closed: connectors are off', () => {
    const policy = resolvedOnDevice([['managed', { disableClaudeAiConnectors: 'maybe' }]]);
    expect(loadedNames(policy)).toEqual(['notes']);
  });

  test("a lower admin source's true applies when the selected one does not set it", () => {
    const policy = resolvedOnDevice([
      ['managed', {}],
      ['managed', { disableClaudeAiConnectors: true }],
    ]);
    expect(loadedNames(policy)).toEqual(['notes']);
  });
});

describe('managed MCP key judgments', () => {
  // Judgment (spec/judgments.md): a settings layer has one `managed` scope, so the layers of the
  // device's own sources are the host's second list (`deviceManaged`); a managed-tier `true` of
  // `allowAllClaudeAiMcps` from any admin source applies (the page lists it among the cross-source
  // keys without saying how sources combine); `ENABLE_CLAUDEAI_MCP_SERVERS` is read as the text `false`.
  test('any other value of ENABLE_CLAUDEAI_MCP_SERVERS leaves the connectors on', () => {
    for (const value of ['true', '0', '', undefined]) {
      const policy = resolvedOnDevice([], [], { env: { ENABLE_CLAUDEAI_MCP_SERVERS: value } });
      expect(plannedNames(planOf({ candidates: [slack] }))).toEqual(['claude.ai Slack']);
      expect(policy.mcp.loadSettings().disableClaudeAiConnectors).toBe(false);
    }
  });

  test('the device list defaults to none', () => {
    expect(
      resolvedOnDevice([
        ['managed', { allowClaudeInChromeWithManagedMcp: true }],
      ]).mcp.loadSettings().allowClaudeInChromeWithManagedMcp,
    ).toBe(false);
  });
});
