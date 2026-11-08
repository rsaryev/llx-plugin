/**
 * mcp.md § "MCP installation scopes": three scopes, "Local | Current project only | No |
 * `~/.claude.json`", "Project | Current project only | Yes, via version control | `.mcp.json` in
 * project root", "User | All your projects | No | `~/.claude.json`".
 * § "Local scope": stored "in `~/.claude.json` under that project's path, so the same server won't
 * appear in your other projects" (the docs' `projects["/path/to/your/project"].mcpServers.stripe`
 * example); the general local settings file differs ("MCP local-scoped servers are stored in
 * `~/.claude.json`, while general local settings use `.claude/settings.local.json`").
 * § "Project scope": the `.mcp.json` file "follows a standardized format" (`mcpServers`).
 * § "User scope": "stored in `~/.claude.json` and provide cross-project accessibility".
 */
import { describe, expect, test } from 'bun:test';
import { claudeJsonServers, projectFileServers } from '../../../src/settings/mcp/index.ts';
import { spec } from '../../support/spec.ts';
import { labels } from '../../support/mcp-rank.ts';

const state = {
  mcpServers: { hubspot: { type: 'http', url: 'https://mcp.hubspot.com/anthropic' } },
  projects: {
    '/path/to/your/project': {
      mcpServers: { stripe: { type: 'http', url: 'https://mcp.stripe.com' } },
    },
    '/other/project': { mcpServers: { other: { command: 'other-server' } } },
  },
};

spec('mcpSettings.behavior.User scope', () => {
  test('the top-level mcpServers of ~/.claude.json load as user scope in every project', () => {
    for (const project of ['/path/to/your/project', '/other/project', '/never/opened']) {
      const { candidates } = claudeJsonServers(state, project);
      expect(candidates.filter((each) => each.scope === 'user')).toEqual([
        {
          scope: 'user',
          name: 'hubspot',
          server: { type: 'http', url: 'https://mcp.hubspot.com/anthropic' },
        },
      ]);
    }
  });

  test('a server written under a project is never a user server, and a top-level one is never local', () => {
    for (const project of ['/path/to/your/project', '/other/project']) {
      const user = labels(claudeJsonServers(state, project).candidates).filter((each) =>
        each.startsWith('user:'),
      );
      expect(user).toEqual(['user:hubspot']);
    }
    const unopened = labels(claudeJsonServers(state, '/never/opened').candidates);
    expect(unopened.filter((each) => each.startsWith('local:'))).toEqual([]);
  });
});

spec('mcpSettings.behavior.Local scope', () => {
  test("the project's own entry of ~/.claude.json loads as local scope, the docs example", () => {
    const { candidates } = claudeJsonServers(state, '/path/to/your/project');
    expect(candidates.filter((each) => each.scope === 'local')).toEqual([
      { scope: 'local', name: 'stripe', server: { type: 'http', url: 'https://mcp.stripe.com' } },
    ]);
  });

  test('the same server does not appear in your other projects', () => {
    expect(labels(claudeJsonServers(state, '/other/project').candidates)).toEqual([
      'local:other',
      'user:hubspot',
    ]);
    expect(labels(claudeJsonServers(state, '/never/opened').candidates)).toEqual(['user:hubspot']);
  });
});

spec('mcpSettings.behavior.Project scope', () => {
  test('.mcp.json servers are project scope, in the standardized mcpServers format', () => {
    const { candidates, issues } = projectFileServers({
      mcpServers: { 'shared-server': { type: 'http', url: 'https://example.com/mcp' } },
    });
    expect(issues).toEqual([]);
    expect(candidates).toEqual([
      {
        scope: 'project',
        name: 'shared-server',
        server: { type: 'http', url: 'https://example.com/mcp' },
      },
    ]);
  });

  test('an entry Claude Code would drop is reported and the others still load', () => {
    const { candidates, issues } = projectFileServers({
      mcpServers: { bad: { url: 'https://example.com/mcp' }, good: { command: 'good' } },
    });
    expect(labels(candidates)).toEqual(['project:good']);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toBe('.mcp.json');
    expect(issues[0]?.message).toContain('"bad"');
  });
});

describe('document reading judgments', () => {
  test('an .mcp.json that is no object is reported, an absent one holds nothing', () => {
    expect(projectFileServers(undefined)).toEqual({ candidates: [], issues: [] });
    expect(projectFileServers([]).issues).toHaveLength(1);
  });

  // Judgment (spec/judgments.md): a ~/.claude.json with no projects map, a project entry that is no
  // object or an mcpServers that is no object hold no servers; the file belongs to Claude Code and the
  // host read it, so the kit says nothing about its other fields.
  test('a state file of another shape holds no servers', () => {
    for (const odd of [undefined, null, [], 'text', { projects: [] }, { projects: { '/p': 1 } }]) {
      expect(claudeJsonServers(odd, '/p')).toEqual({ candidates: [], issues: [] });
    }
  });

  test('a project path is matched exactly, as the key was written', () => {
    expect(labels(claudeJsonServers(state, '/path/to/your/project/').candidates)).toEqual([
      'user:hubspot',
    ]);
  });
});
