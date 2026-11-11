/**
 * sub-agents.md, "Choose the subagent scope" (the priority table and "the higher-priority location"
 * wins a shared name; the closest nested `.claude/agents/` wins; a user or project `Explore`
 * overrides the built-in), "Disable specific subagents" (`Agent(name)` deny rules, also for built-ins;
 * a denied `Agent` tool), "Built-in subagents" (a call without `subagent_type` needs
 * `general-purpose`) and errors.md, "subagent_type is required".
 */
import { describe, expect, test } from 'bun:test';
import { builtinAgents, type BuiltinPolicy } from '../../../src/agents/catalog/builtin.ts';
import { resolveAgents, resolveSubagentType } from '../../../src/agents/catalog/resolve.ts';
import { AGENT_SCOPE_RULES } from '../../../src/agents/catalog/scopes.ts';
import { spec } from '../../support/spec.ts';
import {
  fileAgent,
  flagAgent,
  tierOf,
  pluginAgent,
  scannedAgent,
} from '../../support/agent-catalog.ts';
import { catalogTier } from '../../../src/agents/catalog/types.ts';

const INTERACTIVE: BuiltinPolicy = {
  interactive: true,
  disableExplorePlan: false,
  disableAll: false,
};

/** The agent a name resolves to, written as `source:path` so the winner is visible. */
const winner = (resolved: ReturnType<typeof resolveAgents>, name: string): string | undefined => {
  const found = resolved.agents.find((agent) => agent.name === name);
  return found === undefined ? undefined : `${tierOf(found) ?? ''}:${found.path ?? ''}`;
};

spec('agents.behavior.Choose the subagent scope', () => {
  test('the table of priorities: managed 1, the flag 2, the project 3, the user 4, a plugin 5', () => {
    expect(
      Object.entries(AGENT_SCOPE_RULES)
        .map(([source, rule]) => [rule.priority, source] as const)
        .toSorted(([a], [b]) => a - b),
    ).toEqual([
      [1, 'managed'],
      [2, 'flag'],
      [3, 'project'],
      [4, 'user'],
      [5, 'plugin'],
    ]);
  });

  test('a name defined in several places belongs to the highest-priority location', () => {
    const everywhere = {
      scanned: [
        scannedAgent('user', 'reviewer', { path: '/u/reviewer.md' }),
        scannedAgent('project', 'reviewer', { path: '/p/reviewer.md' }),
        scannedAgent('managed', 'reviewer', { path: '/m/reviewer.md' }),
      ],
      flag: [flagAgent('reviewer')],
    };
    const ladder: [Partial<typeof everywhere>, string][] = [
      [everywhere, 'managed:/m/reviewer.md'],
      [{ ...everywhere, scanned: everywhere.scanned.slice(0, 2) }, 'flag:--agents.reviewer'],
      [{ scanned: everywhere.scanned.slice(0, 2) }, 'project:/p/reviewer.md'],
      [{ scanned: everywhere.scanned.slice(0, 1) }, 'user:/u/reviewer.md'],
    ];
    for (const [input, expected] of ladder) {
      expect(winner(resolveAgents(input), 'reviewer')).toBe(expected);
    }
  });

  test('the lower-priority definitions are reported as shadowed, with who beat them', () => {
    const resolved = resolveAgents({
      scanned: [
        scannedAgent('user', 'reviewer', { path: '/u.md' }),
        scannedAgent('project', 'reviewer', { path: '/p.md' }),
      ],
    });
    expect(resolved.agents).toHaveLength(1);
    expect(resolved.shadowed.map((each) => [each.agent.path, each.by.path])).toEqual([
      ['/u.md', '/p.md'],
    ]);
    expect(resolved.issues).toEqual([]);
  });

  test('a plugin agent has its scoped name, so it never shares one with a file agent', () => {
    const resolved = resolveAgents({
      scanned: [scannedAgent('user', 'reviewer')],
      plugin: [pluginAgent('my-plugin', 'reviewer')],
    });
    expect(resolved.agents.map((agent) => agent.name).toSorted()).toEqual([
      'my-plugin:reviewer',
      'reviewer',
    ]);
  });
});

describe('closest definition wins among the nested project directories', () => {
  spec('agents.behavior.Choose the subagent scope..claude/agents/', () => {
    test('with the same name in several .claude/agents/ directories the one nearest the working directory is used', () => {
      const resolved = resolveAgents({
        scanned: [
          scannedAgent('project', 'tester', { order: 2, path: '/repo/.claude/agents/tester.md' }),
          scannedAgent('project', 'tester', {
            order: 0,
            path: '/repo/web/.claude/agents/tester.md',
          }),
          scannedAgent('project', 'tester', {
            order: 1,
            path: '/repo/apps/.claude/agents/tester.md',
          }),
        ],
      });
      expect(winner(resolved, 'tester')).toBe('project:/repo/web/.claude/agents/tester.md');
      expect(resolved.shadowed).toHaveLength(2);
    });
  });
});

spec('agents.behavior.Choose the subagent scope.--agents', () => {
  test('a flag agent beats the project and user ones (a plugin agent has its scoped name, so it never competes for the bare one) and loses to the managed one', () => {
    const resolved = resolveAgents({
      flag: [flagAgent('reviewer')],
      scanned: [scannedAgent('project', 'reviewer'), scannedAgent('user', 'reviewer')],
      plugin: [pluginAgent('my-plugin', 'reviewer')],
    });
    expect(tierOf(resolved.agents.find((agent) => agent.name === 'reviewer'))).toBe('flag');
    // The plugin agent has its scoped name: it never competed for the bare one.
    expect(resolved.agents.map((agent) => agent.name)).toContain('my-plugin:reviewer');
    const managed = resolveAgents({
      flag: [flagAgent('reviewer')],
      scanned: [scannedAgent('managed', 'reviewer')],
    });
    expect(tierOf(managed.agents.find((agent) => agent.name === 'reviewer'))).toBe('managed');
  });
});

spec('agents.behavior.Choose the subagent scope.Managed settings', () => {
  test('managed definitions take precedence over project and user subagents with the same name', () => {
    const resolved = resolveAgents({
      scanned: [
        scannedAgent('user', 'auditor'),
        scannedAgent('project', 'auditor'),
        scannedAgent('managed', 'auditor'),
      ],
    });
    expect(resolved.agents.map((agent) => catalogTier(agent.source))).toEqual(['managed']);
  });
});

spec(['agents.behavior.Built-in subagents', 'cli.errors.subagent\\_type is required'], () => {
  test.each(['managed', 'project', 'user'] as const)(
    'a %s subagent named Explore overrides the built-in and keeps its own model',
    (source) => {
      const resolved = resolveAgents({
        builtin: builtinAgents(INTERACTIVE),
        scanned: [scannedAgent(source, 'Explore', { extra: 'model: haiku\n' })],
      });
      const explore = resolved.agents.filter((agent) => agent.name === 'Explore');
      expect(explore).toHaveLength(1);
      expect(tierOf(explore[0])).toBe(source);
      expect(explore[0]?.definition.model).toBe('haiku');
      expect(resolved.shadowed.map((each) => catalogTier(each.agent.source))).toEqual(['builtin']);
    },
  );

  test('a flag subagent named Explore overrides the built-in too', () => {
    const resolved = resolveAgents({
      builtin: builtinAgents(INTERACTIVE),
      flag: [flagAgent('Explore', { model: 'haiku' })],
    });
    const explore = resolved.agents.filter((agent) => agent.name === 'Explore');
    expect(explore.map((agent) => catalogTier(agent.source))).toEqual(['flag']);
    expect(explore[0]?.definition.model).toBe('haiku');
  });

  test('every built-in is listed beside the custom subagents', () => {
    const resolved = resolveAgents({
      builtin: builtinAgents(INTERACTIVE),
      scanned: [scannedAgent('project', 'mine')],
    });
    expect(resolved.agents.map((agent) => agent.name).toSorted()).toEqual(
      [
        'Explore',
        'Plan',
        'claude',
        'claude-code-guide',
        'general-purpose',
        'mine',
        'statusline-setup',
      ].toSorted(),
    );
  });

  test('a call without subagent_type runs general-purpose when the session has it', () => {
    const catalog = resolveAgents({ builtin: builtinAgents(INTERACTIVE) });
    const outcome = resolveSubagentType(catalog, undefined);
    expect(outcome).toMatchObject({ ok: true });
    expect(outcome.ok && outcome.agent.name).toBe('general-purpose');
  });

  test('without general-purpose the call fails with the message of errors.md, listing what is available', () => {
    const catalog = resolveAgents({
      builtin: builtinAgents({ ...INTERACTIVE, interactive: false, disableAll: true }),
      scanned: [scannedAgent('project', 'worker'), scannedAgent('user', 'checker')],
    });
    const outcome = resolveSubagentType(catalog, undefined);
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.message).toBe(
      'subagent_type is required: the general-purpose agent is not available in this session. Available agents: checker, worker',
    );
  });

  test('a call that names a subagent the session has gets it; one it has not is refused with the list', () => {
    const catalog = resolveAgents({ scanned: [scannedAgent('project', 'worker')] });
    const found = resolveSubagentType(catalog, 'worker');
    expect(found.ok && tierOf(found.agent)).toBe('project');
    const missing = resolveSubagentType(catalog, 'nobody');
    expect(!missing.ok && missing.message).toContain('Available agents: worker');
  });

  test('general-purpose may itself be replaced by a custom agent of that name', () => {
    const catalog = resolveAgents({
      builtin: builtinAgents(INTERACTIVE),
      scanned: [scannedAgent('project', 'general-purpose')],
    });
    const outcome = resolveSubagentType(catalog, undefined);
    expect(outcome.ok && tierOf(outcome.agent)).toBe('project');
  });
});

describe('judgments of the same-name resolution (spec/judgments.md)', () => {
  test('two files of one agents directory with one name: one loads, chosen by path, and a warning names both files', () => {
    const resolved = resolveAgents({
      scanned: [
        scannedAgent('project', 'twin', { path: '/p/.claude/agents/b/twin.md' }),
        scannedAgent('project', 'twin', { path: '/p/.claude/agents/a/twin.md' }),
      ],
    });
    expect(winner(resolved, 'twin')).toBe('project:/p/.claude/agents/a/twin.md');
    expect(resolved.issues).toHaveLength(1);
    expect(resolved.issues[0]?.severity).toBe('warning');
    expect(resolved.issues[0]?.path).toBe('/p/.claude/agents/b/twin.md');
    expect(resolved.issues[0]?.message).toContain('/p/.claude/agents/a/twin.md');
  });

  test('two names for one file are one agent: a symbolic link to a file already read is not a second', () => {
    const real = scannedAgent('project', 'real', { path: '/p/.claude/agents/real.md' });
    const alias = scannedAgent('project', 'real', { path: '/p/.claude/agents/alias.md' });
    const resolved = resolveAgents({
      scanned: [
        { ...real, canonical: '/p/.claude/agents/real.md' },
        { ...alias, canonical: '/p/.claude/agents/real.md' },
      ],
    });
    expect(resolved.agents).toHaveLength(1);
    expect(resolved.issues).toEqual([]);
  });

  test('two plugin agents with one scoped name keep the first with a warning', () => {
    const resolved = resolveAgents({
      plugin: [
        pluginAgent('my-plugin', 'twin', 'twin.md'),
        pluginAgent('my-plugin', 'twin', 'twin.md'),
      ],
    });
    expect(resolved.agents).toHaveLength(1);
    expect(resolved.issues).toHaveLength(1);
  });

  test('a file agent of every source is listed ahead of the built-ins, by priority', () => {
    const resolved = resolveAgents({
      builtin: builtinAgents(INTERACTIVE),
      scanned: [scannedAgent('user', 'u'), scannedAgent('managed', 'm')],
      flag: [flagAgent('f')],
      plugin: [pluginAgent('p', 'x')],
    });
    expect(resolved.agents.slice(0, 4).map((agent) => catalogTier(agent.source))).toEqual([
      'managed',
      'flag',
      'user',
      'plugin',
    ]);
    expect(tierOf(resolved.agents.at(-1))).toBe('builtin');
    expect(fileAgent('user', 'u').path).toBe('/user/.claude/agents/u.md');
  });
});
