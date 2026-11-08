/**
 * sub-agents.md § Frontmatter reference (`mcpServers`), § Scope MCP servers to a subagent: "Each
 * entry ... is either a server name referencing an already-configured server ... or an inline
 * definition with the server name as key"; "Ignored for plugin subagents"; the MCP restrictions
 * ("`--strict-mcp-config`", managed configuration, `allowedMcpServers` and `deniedMcpServers`) also
 * cover servers in frontmatter, and "`--strict-mcp-config` doesn't filter servers you pass inline via
 * `--agents`"; § Trust required for inline MCP servers. The example is the docs' browser-tester.
 */
import { describe, expect, test } from 'bun:test';
import { resolveAgentMcpServers } from '../../src/agents/context.ts';
import { readAgent } from '../../src/format/agent.ts';
import type { AgentMcpServerSpec } from '../../src/protocol/official.ts';
import { AGENT_SOURCES, type AgentSource } from '../../src/format/agent-record.ts';
import { at, file, loaded, plugin } from '../support/agent-files.ts';
import { policy } from '../support/agent-context.ts';
import { spec } from '../support/spec.ts';

const BROWSER_TESTER = [
  'name: browser-tester',
  'description: Tests features in a real browser using Playwright',
  'mcpServers:',
  '  # Inline definition: scoped to this subagent only',
  '  - playwright:',
  '      type: stdio',
  '      command: npx',
  '      args: ["-y", "@playwright/mcp@latest"]',
  '  # Reference by name: reuses an already-configured server',
  '  - github',
].join('\n');

type InlineConfig = Exclude<AgentMcpServerSpec, string>[string];

const PLAYWRIGHT: InlineConfig = {
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@playwright/mcp@latest'],
};

const browserTester = (source: 'project' | 'user' | 'managed' = 'project') =>
  loaded(readAgent(file(BROWSER_TESTER), at(source))).definition.mcpServers;

const ctx = (source: AgentSource, folderTrusted = true, blocked = policy()) => ({
  source,
  folderTrusted,
  policy: blocked,
});

spec('agents.frontmatter.mcpServers', () => {
  test('a string is a reference and a keyed entry an inline definition, as in the docs example', () => {
    expect(browserTester()).toEqual([{ playwright: PLAYWRIGHT }, 'github']);
    expect(resolveAgentMcpServers(browserTester(), ctx('project'))).toEqual({
      references: ['github'],
      inline: { playwright: PLAYWRIGHT },
      skipped: [],
    });
  });

  test('inline definitions keep their config for the stdio, http and sse types', () => {
    const configs: Record<'files' | 'docs' | 'feed', InlineConfig> = {
      files: { type: 'stdio', command: 'npx', args: ['-y', 'files'] },
      docs: { type: 'http', url: 'https://example.com/mcp' },
      feed: { type: 'sse', url: 'https://example.com/sse' },
    };
    const resolved = resolveAgentMcpServers(
      [{ files: configs.files }, { docs: configs.docs }, { feed: configs.feed }],
      ctx('user'),
    );
    expect(resolved.inline).toEqual({
      files: configs.files,
      docs: configs.docs,
      feed: configs.feed,
    });
  });

  test('a ws server (a type the docs list and the SDK type omits) is read and kept as written', () => {
    const front = 'mcpServers:\n  - live:\n      type: ws\n      url: wss://example.com/ws';
    const specs = loaded(readAgent(file(`name: x\ndescription: d\n${front}`), at('user')))
      .definition.mcpServers;
    const { live } = resolveAgentMcpServers(specs, ctx('user')).inline;
    expect(JSON.stringify(live)).toBe('{"type":"ws","url":"wss://example.com/ws"}');
  });

  test('a field without entries gives no server', () => {
    const none = { references: [], inline: {}, skipped: [] };
    expect(resolveAgentMcpServers(undefined, ctx('project'))).toEqual(none);
    expect(resolveAgentMcpServers([], ctx('project'))).toEqual(none);
  });

  test('a plugin agent ignores the field: its record drops it and resolving yields no server', () => {
    const agent = loaded(readAgent(file(BROWSER_TESTER), plugin()));
    expect(agent.definition.mcpServers).toBeUndefined();
    expect(agent.ignored).toContain('mcpServers');
    expect(resolveAgentMcpServers(browserTester(), ctx('plugin'))).toEqual({
      references: [],
      inline: {},
      skipped: [],
    });
  });

  test('an inline server of a project (or --add-dir) agent file is skipped until the folder is trusted; the reference is not', () => {
    expect(resolveAgentMcpServers(browserTester(), ctx('project', false))).toEqual({
      references: ['github'],
      inline: {},
      skipped: [{ name: 'playwright', reason: 'untrusted-folder' }],
    });
  });

  test('user agents, --agents and managed agents load inline servers without folder trust', () => {
    for (const source of ['user', 'flag', 'managed'] as const) {
      const resolved = resolveAgentMcpServers(browserTester(), ctx(source, false));
      expect(resolved.inline).toEqual({ playwright: PLAYWRIGHT });
      expect(resolved.skipped).toEqual([]);
    }
  });

  test('every source is covered by the trust rule: only project agents wait for it', () => {
    const waiting = AGENT_SOURCES.filter(
      (source) => resolveAgentMcpServers(browserTester(), ctx(source, false)).skipped.length > 0,
    );
    expect(waiting).toEqual(['project']);
  });

  test('a server the policy blocks is skipped with its reason; the allowed ones stay', () => {
    const resolved = resolveAgentMcpServers(
      [{ playwright: PLAYWRIGHT }, { files: { type: 'stdio', command: 'files' } }],
      ctx('user', true, policy({ all: ['playwright'] })),
    );
    expect(resolved.inline).toEqual({ files: { type: 'stdio', command: 'files' } });
    expect(resolved.skipped).toEqual([{ name: 'playwright', reason: 'policy' }]);
  });

  test('a blocked reference is skipped as well', () => {
    const resolved = resolveAgentMcpServers(
      ['github', 'slack'],
      ctx('project', true, policy({ all: ['github'] })),
    );
    expect(resolved.references).toEqual(['slack']);
    expect(resolved.skipped).toEqual([{ name: 'github', reason: 'policy' }]);
  });

  test('--strict-mcp-config does not filter inline servers of an --agents definition, other sources it does', () => {
    const strict = policy({ all: ['playwright'] });
    expect(resolveAgentMcpServers(browserTester(), ctx('flag', true, strict)).inline).toEqual({
      playwright: PLAYWRIGHT,
    });
    for (const source of ['project', 'user', 'managed'] as const) {
      const resolved = resolveAgentMcpServers(browserTester(), ctx(source, true, strict));
      expect(resolved.inline).toEqual({});
      expect(resolved.skipped).toEqual([{ name: 'playwright', reason: 'policy' }]);
    }
  });

  test('managed-settings restrictions apply to every subagent, an --agents definition included', () => {
    const managed = policy({ managed: ['playwright'] });
    for (const source of ['flag', 'project', 'user', 'managed'] as const) {
      const resolved = resolveAgentMcpServers(browserTester(), ctx(source, true, managed));
      expect(resolved.inline).toEqual({});
      expect(resolved.skipped).toEqual([{ name: 'playwright', reason: 'policy' }]);
    }
  });
});

describe('MCP resolution, outside spec: choices the docs leave open', () => {
  test('an untrusted folder is reported before the policy', () => {
    const resolved = resolveAgentMcpServers(
      [{ playwright: PLAYWRIGHT }],
      ctx('project', false, policy({ all: ['playwright'] })),
    );
    expect(resolved.skipped).toEqual([{ name: 'playwright', reason: 'untrusted-folder' }]);
  });

  test('an entry with several keys defines several servers; a later definition of a name replaces an earlier one', () => {
    const resolved = resolveAgentMcpServers(
      [
        { a: { type: 'stdio', command: 'one' }, b: { type: 'stdio', command: 'b' } },
        { a: { type: 'stdio', command: 'two' } },
      ],
      ctx('user'),
    );
    expect(resolved.inline).toEqual({
      a: { type: 'stdio', command: 'two' },
      b: { type: 'stdio', command: 'b' },
    });
  });

  test('a repeated reference is listed once, in order', () => {
    const resolved = resolveAgentMcpServers(['b', 'a', 'b'], ctx('user'));
    expect(resolved.references).toEqual(['b', 'a']);
  });
});
