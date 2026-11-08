/**
 * mcp.md § Trust a folder before its headersHelper runs (project and local servers run the helper only
 * in a folder with persisted trust; a parent's trust and the automatic `-p` or SDK trust do not
 * count; `hasTrustDialogAccepted` in `~/.claude.json` grants it without a dialog; an agent file's
 * inline server is not loaded at all until its project or `--add-dir` directory is trusted);
 * errors.md § headersHelper not run (the line, stderr in `-p` and SDK sessions, the debug log in an
 * interactive one).
 */
import { describe, expect, test } from 'bun:test';
import { persistedTrust, planHeadersHelper, type HeadersHelperPlan } from '../../../src/index.ts';
import { contextOf, serverOf, TRUSTED, trustOf } from '../../support/headers-helper.ts';
import { spec } from '../../support/spec.ts';

const agent = (origin: 'agent-project' | 'agent-add-dir', trust: ReturnType<typeof trustOf>) =>
  planHeadersHelper(serverOf(), origin, trust, contextOf());

const noticeOf = (plan: HeadersHelperPlan) => (plan.run || !plan.loaded ? undefined : plan.notice);

spec('mcp.behavior.Trust a folder before its headersHelper runs.Until you trust the folder', () => {
  const untrusted = trustOf({ source: 'none', interactive: false });

  test('a project or local server connects with its static headers alone: the helper does not run', () => {
    for (const origin of ['project', 'local'] as const) {
      const plan = planHeadersHelper(serverOf(), origin, untrusted, contextOf());
      expect(plan).toMatchObject({ run: false, loaded: true, headersOnly: true });
    }
  });

  test('a claude -p or SDK session prints one line per server to stderr that tells how to grant the trust', () => {
    const plan = planHeadersHelper(serverOf(), 'project', untrusted, contextOf());
    expect(noticeOf(plan)?.channel).toBe('stderr');
    expect(noticeOf(plan)?.text).toBe(
      'MCP server \'internal-api\': headersHelper not run — this workspace has no persisted trust; accept the trust dialog here once interactively, or set projects["/work/app"].hasTrustDialogAccepted in /home/user/.claude.json.',
    );
  });

  test('an interactive session writes the same refusal to the debug log instead', () => {
    const plan = planHeadersHelper(
      serverOf(),
      'local',
      { ...untrusted, interactive: true },
      contextOf(),
    );
    expect(noticeOf(plan)?.channel).toBe('debug-log');
    expect(noticeOf(plan)?.text).toContain('headersHelper not run');
  });

  test('servers of the other places are not held back', () => {
    for (const origin of ['user', 'managed', 'connector', 'sdk', 'mcp-config', 'plugin'] as const) {
      expect(planHeadersHelper(serverOf(), origin, untrusted, contextOf()).run).toBe(true);
    }
  });
});

// An id with an apostrophe: the static scan of `check:spec` reads quoted literals and stops at it, so
// the id is a constant; `spec()` still fails at once on an id that is not a requirement.
const DOES_NOT_COUNT =
  "mcp.behavior.Trust a folder before its headersHelper runs.Trust that doesn't count";

spec(DOES_NOT_COUNT, () => {
  test("a parent folder's trust does not let a project or local helper run", () => {
    for (const origin of ['project', 'local'] as const) {
      const plan = planHeadersHelper(
        serverOf(),
        origin,
        trustOf({ source: 'parent-folder' }),
        contextOf(),
      );
      expect(plan.run).toBe(false);
    }
  });

  test('the automatic trust a claude -p or SDK session gets for settings hooks does not count either', () => {
    for (const origin of ['project', 'local'] as const) {
      const plan = planHeadersHelper(
        serverOf(),
        origin,
        trustOf({ source: 'automatic-session', interactive: false }),
        contextOf(),
      );
      expect(plan.run).toBe(false);
    }
  });

  test('persisted trust of the folder itself does', () => {
    expect(planHeadersHelper(serverOf(), 'project', TRUSTED, contextOf()).run).toBe(true);
  });
});

spec('mcp.behavior.Trust a folder before its headersHelper runs.Trust without a dialog', () => {
  const claudeJson = {
    projects: {
      '/work/app': { hasTrustDialogAccepted: true },
      '/work/other': { hasTrustDialogAccepted: false },
      '/work': { hasTrustDialogAccepted: true },
    },
  };

  test('projects["<path>"].hasTrustDialogAccepted = true in ~/.claude.json is persisted trust', () => {
    expect(persistedTrust(claudeJson, '/work/app')).toBe('persisted');
    const plan = planHeadersHelper(
      serverOf(),
      'project',
      trustOf({ source: persistedTrust(claudeJson, '/work/app') }),
      contextOf(),
    );
    expect(plan.run).toBe(true);
  });

  test("false, a missing entry, another path and a malformed file are no trust; a parent's entry is not this folder's", () => {
    expect(persistedTrust(claudeJson, '/work/other')).toBe('none');
    expect(persistedTrust(claudeJson, '/work/app/sub')).toBe('none');
    expect(persistedTrust({}, '/work/app')).toBe('none');
    expect(persistedTrust(null, '/work/app')).toBe('none');
    expect(
      persistedTrust({ projects: { '/work/app': { hasTrustDialogAccepted: 'yes' } } }, '/work/app'),
    ).toBe('none');
  });
});

describe("trust for an agent file's inline server", () => {
  test('until that project or directory is trusted the server is not loaded at all, so its helper never runs', () => {
    expect(agent('agent-project', trustOf({ source: 'none' }))).toEqual({
      run: false,
      loaded: false,
    });
    expect(agent('agent-add-dir', trustOf({ source: 'none', key: '/extra' }))).toEqual({
      run: false,
      loaded: false,
    });
  });

  test("a parent folder's or automatic trust does not load it", () => {
    expect(agent('agent-project', trustOf({ source: 'parent-folder' })).run).toBe(false);
    expect(agent('agent-project', trustOf({ source: 'automatic-session' }))).toEqual({
      run: false,
      loaded: false,
    });
  });

  test('trusted, it runs (an --add-dir agent in the configuration directory)', () => {
    expect(agent('agent-project', TRUSTED).run).toBe(true);
  });
});
