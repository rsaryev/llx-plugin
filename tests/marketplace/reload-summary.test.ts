/**
 * plugins/cli-reference.md § /reload-plugins (`--force`, and `force` without dashes), § Reload summary
 * (`Reloaded: N plugins · N skills · N agents · N hooks · N plugin MCP servers · N plugin LSP servers`,
 * the MCP count omitted without an interactive terminal; `N errors during load. Run /plugin for
 * details.`; the skills count covers `commands/` entries and `SKILL.md` skills; the agents count is
 * every agent loaded in the session; `(+ N dependencies: <names>) resolved`), § Reloads that change
 * MCP tools (the refusal line and `--force`; the `LSP` tool forms), § Sessions without an interactive
 * terminal (no MCP connect or disconnect; a command that did not come from the user's own typing
 * replies `/reload-plugins isn't available over a remote connection in this session.`).
 * plugins/troubleshooting.md § `Run /reload-plugins to apply.` repeats the two lines. How the error
 * and dependency clauses join the counts, and the order of several servers, are rows in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import {
  parseReloadArguments,
  reloadAllowed,
  reloadGate,
  reloadSummary,
  skillCount,
  type ReloadCounts,
} from '../../src/marketplace/reload-summary.ts';
import { spec } from '../support/spec.ts';

const counts = (extra: Partial<ReloadCounts> = {}): ReloadCounts => ({
  plugins: 3,
  skills: 7,
  agents: 4,
  hooks: 5,
  mcpServers: 2,
  lspServers: 1,
  errors: 0,
  ...extra,
});

spec('install.plugin.Reload summary', () => {
  test('one line: plugins, skills, agents, hooks, plugin MCP servers and plugin LSP servers', () => {
    expect(reloadSummary(counts(), { interactive: true })).toBe(
      'Reloaded: 3 plugins · 7 skills · 4 agents · 5 hooks · 2 plugin MCP servers · 1 plugin LSP servers',
    );
  });

  test('a session without an interactive terminal omits the plugin MCP server count', () => {
    expect(reloadSummary(counts(), { interactive: false })).toBe(
      'Reloaded: 3 plugins · 7 skills · 4 agents · 5 hooks · 1 plugin LSP servers',
    );
  });

  test('when any plugin failed the summary adds the error count and where to look', () => {
    expect(reloadSummary(counts({ errors: 2 }), { interactive: true })).toBe(
      'Reloaded: 3 plugins · 7 skills · 4 agents · 5 hooks · 2 plugin MCP servers · 1 plugin LSP servers 2 errors during load. Run /plugin for details.',
    );
  });

  test('no errors adds nothing', () => {
    expect(reloadSummary(counts({ errors: 0 }), { interactive: true })).not.toContain('errors');
  });

  test("the skills count covers a plugin's commands/ entries and its SKILL.md skills", () => {
    expect(skillCount({ commands: 2, skillFiles: 3 })).toBe(5);
    expect(skillCount({ commands: 0, skillFiles: 4 })).toBe(4);
  });

  test('missing dependencies are installed, the reload runs again, and the summary names them', () => {
    expect(
      reloadSummary(counts({ resolvedDependencies: ['lib@acme', 'base@acme'] }), {
        interactive: true,
      }),
    ).toBe(
      'Reloaded: 3 plugins · 7 skills · 4 agents · 5 hooks · 2 plugin MCP servers · 1 plugin LSP servers (+ 2 dependencies: lib@acme, base@acme) resolved',
    );
  });

  test('no dependency was resolved adds nothing', () => {
    expect(
      reloadSummary(counts({ resolvedDependencies: [] }), { interactive: true }),
    ).not.toContain('dependencies');
  });

  test('the dependency clause comes before the error clause', () => {
    const text = reloadSummary(counts({ errors: 1, resolvedDependencies: ['lib@acme'] }), {
      interactive: true,
    });
    expect(text.indexOf('resolved')).toBeLessThan(text.indexOf('1 errors'));
  });
});

const MCP =
  ' — your next message will re-read the whole conversation instead of using the cache. Run /reload-plugins --force to apply.';

spec('install.plugin.Reloads that change MCP tools', () => {
  test('a reload that adds or removes a plugin MCP server and would invalidate the cache is not applied', () => {
    expect(
      reloadGate(
        { addedMcp: ['docs'], removedMcp: [], lsp: 'unchanged', invalidatesPromptCache: true },
        { force: false, interactive: true },
      ),
    ).toEqual({ apply: false, message: `This reload changes MCP tools (docs)${MCP}` });
  });

  test('every server the reload adds or removes is named', () => {
    const gate = reloadGate(
      { addedMcp: ['a', 'b'], removedMcp: ['c'], lsp: 'unchanged', invalidatesPromptCache: true },
      { force: false, interactive: true },
    );
    expect(gate).toEqual({
      apply: false,
      message: `This reload changes MCP tools (a, b, c)${MCP}`,
    });
  });

  test('the LSP tool appearing or disappearing starts the line "This reload adds the LSP tool" or "removes"', () => {
    const adds = reloadGate(
      { addedMcp: [], removedMcp: [], lsp: 'adds', invalidatesPromptCache: true },
      { force: false, interactive: true },
    );
    const removes = reloadGate(
      { addedMcp: [], removedMcp: [], lsp: 'removes', invalidatesPromptCache: true },
      { force: false, interactive: true },
    );
    expect(adds).toEqual({ apply: false, message: `This reload adds the LSP tool${MCP}` });
    expect(removes).toEqual({ apply: false, message: `This reload removes the LSP tool${MCP}` });
  });

  test('--force applies it anyway', () => {
    expect(
      reloadGate(
        { addedMcp: ['docs'], removedMcp: [], lsp: 'unchanged', invalidatesPromptCache: true },
        { force: true, interactive: true },
      ),
    ).toEqual({ apply: true, mcpDeferred: false });
  });

  test('a change that would not invalidate the prompt cache is applied', () => {
    expect(
      reloadGate(
        { addedMcp: ['docs'], removedMcp: [], lsp: 'unchanged', invalidatesPromptCache: false },
        { force: false, interactive: true },
      ),
    ).toEqual({ apply: true, mcpDeferred: false });
  });

  test('a reload that changes no MCP server and not the LSP tool is applied', () => {
    expect(
      reloadGate(
        { addedMcp: [], removedMcp: [], lsp: 'unchanged', invalidatesPromptCache: true },
        { force: false, interactive: true },
      ),
    ).toEqual({ apply: true, mcpDeferred: false });
  });

  test('--force and force without dashes both force; anything else does not', () => {
    expect(parseReloadArguments('--force')).toEqual({ force: true });
    expect(parseReloadArguments('force')).toEqual({ force: true });
    expect(parseReloadArguments('')).toEqual({ force: false });
    expect(parseReloadArguments('--forced')).toEqual({ force: false });
  });
});

spec('install.plugin.Sessions without an interactive terminal', () => {
  test('the reload does not connect or disconnect plugin MCP servers: those changes wait for the next session', () => {
    expect(
      reloadGate(
        { addedMcp: ['docs'], removedMcp: ['old'], lsp: 'unchanged', invalidatesPromptCache: true },
        { force: false, interactive: false },
      ),
    ).toEqual({ apply: true, mcpDeferred: true });
  });

  test('a session that is not interactive runs the command only when the user typed it', () => {
    expect(reloadAllowed({ interactive: false, typedByUser: true })).toEqual({ allowed: true });
    expect(reloadAllowed({ interactive: false, typedByUser: false })).toEqual({
      allowed: false,
      reply: "/reload-plugins isn't available over a remote connection in this session.",
    });
  });

  test('an interactive terminal accepts the command whichever way it arrives', () => {
    expect(reloadAllowed({ interactive: true, typedByUser: false })).toEqual({ allowed: true });
  });
});

describe('the Run /reload-plugins to apply. ending', () => {
  test('a reload that is refused leaves the changes pending', () => {
    const gate = reloadGate(
      { addedMcp: ['docs'], removedMcp: [], lsp: 'unchanged', invalidatesPromptCache: true },
      { force: false, interactive: true },
    );
    expect(gate.apply).toBe(false);
  });
});
