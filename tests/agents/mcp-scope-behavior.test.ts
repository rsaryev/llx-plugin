/**
 * sub-agents.md § Scope MCP servers to a subagent (inline and referenced servers, the main-session
 * case, the restrictions that also cover them) and § Trust required for inline MCP servers (the folder
 * the agent file came from, the trust that does not count, what happens until then, `--add-dir`). The
 * examples are the docs' browser-tester agent and the `projects[...]` key of `~/.claude.json`.
 */
import { describe, expect, test } from 'bun:test';
import {
  agentFolderTrust,
  inlineServerLifecycle,
  resolveAgentMcpServers,
  trustKeyOf,
} from '../../src/agents/mcp-scope.ts';
import type { AgentSource } from '../../src/format/agent-record.ts';
import type { AgentMcpServerSpec } from '../../src/protocol/official.ts';
import { policy } from '../support/agent-context.ts';
import { spec } from '../support/spec.ts';

type InlineConfig = Exclude<AgentMcpServerSpec, string>[string];
const PLAYWRIGHT: InlineConfig = {
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@playwright/mcp@latest'],
};
const BROWSER_TESTER: AgentMcpServerSpec[] = [{ playwright: PLAYWRIGHT }, 'github'];

const ctx = (source: AgentSource, folderTrusted = true, blocked = policy()) => ({
  source,
  folderTrusted,
  policy: blocked,
});

const FOLDER = '/work/app';
const OTHER = '/elsewhere/lib';

spec('agents.behavior.Scope MCP servers to a subagent', () => {
  test('an inline definition is scoped to the subagent and a string reuses a configured server', () => {
    const resolved = resolveAgentMcpServers(BROWSER_TESTER, ctx('user'));
    expect(resolved.inline).toEqual({ playwright: PLAYWRIGHT });
    expect(resolved.references).toEqual(['github']);
  });

  test('inline servers connect when the subagent starts and disconnect when it finishes; the main session connects them at startup', () => {
    expect(inlineServerLifecycle(false)).toEqual({
      connectsAt: 'subagent-start',
      disconnectsAt: 'subagent-finish',
    });
    expect(inlineServerLifecycle(true).connectsAt).toBe('session-start');
  });

  test('the inline schema is the .mcp.json one: stdio, http and sse servers are kept as written', () => {
    const configs = {
      files: { type: 'stdio', command: 'npx' },
      docs: { type: 'http', url: 'https://example.com/mcp' },
      feed: { type: 'sse', url: 'https://example.com/sse' },
    } satisfies Record<string, InlineConfig>;
    const resolved = resolveAgentMcpServers(
      [{ files: configs.files }, { docs: configs.docs }, { feed: configs.feed }],
      ctx('user'),
    );
    expect(Object.keys(resolved.inline)).toEqual(['files', 'docs', 'feed']);
  });

  test('the restrictions of the main session also cover the frontmatter: a blocked server is skipped and named', () => {
    const resolved = resolveAgentMcpServers(
      BROWSER_TESTER,
      ctx('user', true, policy({ all: ['playwright', 'github'] })),
    );
    expect(resolved.inline).toEqual({});
    expect(resolved.references).toEqual([]);
    expect(new Set(resolved.skipped.map((entry) => entry.name))).toEqual(
      new Set(['playwright', 'github']),
    );
  });

  test('--strict-mcp-config leaves the inline servers of --agents alone; managed restrictions bind every subagent', () => {
    const strict = policy({ all: ['playwright'] });
    expect(resolveAgentMcpServers(BROWSER_TESTER, ctx('flag', true, strict)).inline).toEqual({
      playwright: PLAYWRIGHT,
    });
    const managed = policy({ managed: ['playwright'] });
    expect(resolveAgentMcpServers(BROWSER_TESTER, ctx('flag', true, managed)).inline).toEqual({});
  });
});

spec('agents.behavior.Trust required for inline MCP servers', () => {
  test('an inline server from the project .claude/agents waits for trust of its folder; a reference does not', () => {
    const resolved = resolveAgentMcpServers(BROWSER_TESTER, ctx('project', false));
    expect(resolved.inline).toEqual({});
    expect(resolved.references).toEqual(['github']);
    expect(resolved.skipped).toEqual([{ name: 'playwright', reason: 'untrusted-folder' }]);
  });

  test('~/.claude/agents, --agents and managed settings load inline servers without the check', () => {
    for (const source of ['user', 'flag', 'managed'] as const) {
      expect(resolveAgentMcpServers(BROWSER_TESTER, ctx(source, false)).inline).toEqual({
        playwright: PLAYWRIGHT,
      });
    }
  });

  test('a folder whose entry has hasTrustDialogAccepted true is trusted, and its servers load', () => {
    const trust = agentFolderTrust({
      agentFolder: FOLDER,
      projects: { [FOLDER]: { hasTrustDialogAccepted: true } },
    });
    expect(trust.trusted).toBe(true);
    expect(resolveAgentMcpServers(BROWSER_TESTER, ctx('project', trust.trusted)).inline).toEqual({
      playwright: PLAYWRIGHT,
    });
  });
});

spec("agents.behavior.Trust required for inline MCP servers.Trust that doesn't count", () => {
  test("a parent folder's trust does not make the agent's folder trusted", () => {
    const trust = agentFolderTrust({
      agentFolder: `${FOLDER}/packages/web`,
      projects: { [FOLDER]: { hasTrustDialogAccepted: true } },
    });
    expect(trust.trusted).toBe(false);
  });

  test('the automatic trust of a -p or SDK session does not count', () => {
    expect(
      agentFolderTrust({ agentFolder: FOLDER, projects: {}, automaticTrust: true }).trusted,
    ).toBe(false);
  });

  test('an entry that says false, or has no such field, is not trust', () => {
    expect(
      agentFolderTrust({
        agentFolder: FOLDER,
        projects: { [FOLDER]: { hasTrustDialogAccepted: false } },
      }).trusted,
    ).toBe(false);
    expect(agentFolderTrust({ agentFolder: FOLDER, projects: { [FOLDER]: {} } }).trusted).toBe(
      false,
    );
  });
});

spec('agents.behavior.Trust required for inline MCP servers.Until then', () => {
  const projects = {};
  const untrusted = agentFolderTrust({ agentFolder: FOLDER, projects });

  test('every inline server of the agent file is skipped, and the debug log gets the exact key', () => {
    const resolved = resolveAgentMcpServers(
      [{ playwright: PLAYWRIGHT }, { files: { type: 'stdio', command: 'files' } }],
      { ...ctx('project', untrusted.trusted), trustKey: untrusted.key },
    );
    expect(resolved.inline).toEqual({});
    expect(resolved.skipped.map((entry) => entry.name)).toEqual(['playwright', 'files']);
    expect(untrusted.key).toBe('projects["/work/app"].hasTrustDialogAccepted');
    expect(resolved.debug?.length).toBe(1);
    expect(resolved.debug?.[0]).toContain('projects["/work/app"].hasTrustDialogAccepted');
  });

  test('the key is built from the folder as written, quotes and backslashes escaped', () => {
    expect(trustKeyOf('C:\\work\\app')).toBe(
      'projects["C:\\\\work\\\\app"].hasTrustDialogAccepted',
    );
  });

  test('no line is written when nothing waited: a trusted folder, or a user agent', () => {
    expect(
      resolveAgentMcpServers(BROWSER_TESTER, { ...ctx('project', true), trustKey: untrusted.key })
        .debug,
    ).toBeUndefined();
    expect(
      resolveAgentMcpServers(BROWSER_TESTER, { ...ctx('user', false), trustKey: untrusted.key })
        .debug,
    ).toBeUndefined();
  });
});

spec('agents.behavior.Trust required for inline MCP servers.--add-dir directories', () => {
  test('a directory outside the trusted workspace repository needs its own trust entry', () => {
    const projects = { [FOLDER]: { hasTrustDialogAccepted: true } };
    expect(agentFolderTrust({ agentFolder: OTHER, projects }).trusted).toBe(false);
    expect(
      agentFolderTrust({
        agentFolder: OTHER,
        projects: { ...projects, [OTHER]: { hasTrustDialogAccepted: true } },
      }).trusted,
    ).toBe(true);
  });

  test("its .claude/agents files do not inherit the workspace's trust: the outside directory stays skipped", () => {
    const trust = agentFolderTrust({
      agentFolder: OTHER,
      projects: { [FOLDER]: { hasTrustDialogAccepted: true } },
    });
    const resolved = resolveAgentMcpServers(BROWSER_TESTER, {
      ...ctx('project', trust.trusted),
      trustKey: trust.key,
    });
    expect(resolved.inline).toEqual({});
    expect(resolved.debug?.[0]).toContain(`projects["${OTHER}"]`);
  });
});

describe('trust of an --add-dir directory inside the workspace, outside spec: a judgment', () => {
  test("inside the trusted workspace's repository the workspace's trust stands", () => {
    expect(
      agentFolderTrust({
        agentFolder: `${FOLDER}/vendor/tool`,
        projects: { [FOLDER]: { hasTrustDialogAccepted: true } },
        insideTrustedWorkspace: true,
      }).trusted,
    ).toBe(true);
  });
});
