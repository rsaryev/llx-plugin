/**
 * A session's own locations (`SessionOptions.locations`): one host serves sessions of several
 * projects, each with its own project folder and its own plugin folders, and every part of a
 * session resolves against that session's: hooks, skills, agents, MCP and LSP servers, monitors.
 * hooks.md § Reference scripts by path ("`${CLAUDE_PROJECT_DIR}`: the project root where the session
 * started"; "Worktrees are different": it stays put when the working directory moves);
 * plugins/manifest-reference.md § Environment variables. That a host gives the locations per session
 * is a judgment (spec/judgments.md): the docs do not describe a host serving several projects.
 * Tested outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import type { Locations } from '../../src/ports/index.ts';
import { hostOf, loaded, SESSION, signal } from '../support/host.ts';
import { hostPlugin } from '../support/host-update.ts';
import { locations } from '../support/ports.ts';

const json = (value: unknown): string => JSON.stringify(value);
const BOTH = '${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PROJECT_DIR}';

/** `tools`: every component that reads the plugin root and the project folder. */
const TOOLS_FILES: Record<string, string> = {
  '.claude-plugin/plugin.json': json({ name: 'tools' }),
  'skills/where/SKILL.md': `---\ndescription: Where\n---\n${BOTH}`,
  'agents/helper.md': `---\nname: helper\ndescription: Helps\n---\n${BOTH}`,
  'hooks/hooks.json': json({
    hooks: { Stop: [{ hooks: [{ type: 'command', command: `echo ${BOTH}` }] }] },
  }),
  '.mcp.json': json({
    mcpServers: { db: { command: '${CLAUDE_PLUGIN_ROOT}/db', args: ['${CLAUDE_PROJECT_DIR}'] } },
  }),
  '.lsp.json': json({
    ts: {
      command: '${CLAUDE_PLUGIN_ROOT}/ls',
      args: ['${CLAUDE_PROJECT_DIR}'],
      extensionToLanguage: { '.ts': 'typescript' },
    },
  }),
  'monitors/monitors.json': json([{ name: 'log', command: `tail ${BOTH}`, description: 'Log' }]),
};

/** The locations of one project: its folder, and its plugins under `plugins`. */
const projectLocations = (project: string, plugins: string): Locations => ({
  ...locations({ project, plugins }),
  existingDirectory: (candidates) => Promise.resolve(candidates[0]),
});

async function twoSessions() {
  const fixture = await hostOf({ plugins: [], runs: [{}, {}] });
  const tools = await loaded(TOOLS_FILES);
  const open = (name: string) =>
    fixture.host.openSession({
      ...SESSION,
      sessionId: name,
      cwd: `/work/${name}`,
      locations: projectLocations(`/work/${name}`, `/work/${name}/.plugins`),
      plugins: [hostPlugin('tools@inline', tools)],
    });
  return { ...fixture, a: open('a'), b: open('b') };
}

const seen = (name: string) => `/work/${name}/.plugins/tools@inline /work/${name}`;

describe("judgment: a session's locations are the session's for everything it resolves", () => {
  test('a skill of each session reads its own plugin root and project folder', async () => {
    const { a, b } = await twoSessions();
    for (const [session, name] of [
      [a, 'a'],
      [b, 'b'],
    ] as const) {
      const result = await session.expandSkill('tools:where', { signal: signal() });
      expect(result.ok && result.text.endsWith(seen(name))).toBe(true);
    }
  });

  test("an agent's prompt of each session reads its own", async () => {
    const { a, b } = await twoSessions();
    const prompts = await Promise.all(
      [a, b].map(async (session) => (await session.agents({ builtin: false })).resolved),
    );
    expect(prompts.map((agents) => agents.map((agent) => agent.definition.prompt))).toEqual([
      [seen('a')],
      [seen('b')],
    ]);
  });

  test('the MCP and LSP servers and monitors of each session read its own', async () => {
    const { a, b } = await twoSessions();
    for (const [session, name] of [
      [a, 'a'],
      [b, 'b'],
    ] as const) {
      const root = `/work/${name}/.plugins/tools@inline`;
      const mcp = await session.mcpServers();
      expect(mcp.resolved[0]?.server).toMatchObject({
        command: `${root}/db`,
        args: [`/work/${name}`],
      });
      const lsp = await session.lspServers();
      expect(lsp.resolved[0]).toMatchObject({ command: `${root}/ls`, args: [`/work/${name}`] });
      const monitors = await session.monitors();
      expect(monitors.resolved[0]).toMatchObject({
        command: 'tail ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PROJECT_DIR}',
        environment: { CLAUDE_PLUGIN_ROOT: root, CLAUDE_PROJECT_DIR: `/work/${name}` },
      });
    }
  });

  test('a hook of each session runs with its own, in its command and its environment', async () => {
    const { a, b, runner } = await twoSessions();
    await a.dispatch('Stop', { stop_hook_active: false }, { signal: signal() });
    await b.dispatch('Stop', { stop_hook_active: false }, { signal: signal() });
    expect(runner.calls.map((run) => run.env?.['CLAUDE_PLUGIN_ROOT'])).toEqual([
      '/work/a/.plugins/tools@inline',
      '/work/b/.plugins/tools@inline',
    ]);
    expect(runner.calls.map((run) => run.env?.['CLAUDE_PROJECT_DIR'])).toEqual([
      '/work/a',
      '/work/b',
    ]);
  });

  test('a turn that moves the working directory keeps the project folder where the session started', async () => {
    const { a } = await twoSessions();
    const moved = a.withTurn({ cwd: '/work/a/.claude/worktrees/feature' });
    const result = await moved.expandSkill('tools:where', { signal: signal() });
    expect(result.ok && result.text.endsWith(seen('a'))).toBe(true);
  });

  test("a session without locations reads the host's", async () => {
    const { host } = await hostOf({
      plugins: [hostPlugin('tools@inline', await loaded(TOOLS_FILES))],
    });
    const { resolved } = await host.openSession(SESSION).agents({ builtin: false });
    expect(resolved[0]?.definition.prompt).toBe('/plugins/tools@inline /work/app');
  });
});
