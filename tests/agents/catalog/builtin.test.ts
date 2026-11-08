/**
 * sub-agents.md, "Built-in subagents": Explore, Plan and general-purpose with the tools, model and
 * start-up context the page gives each, the "Other" table (claude, statusline-setup,
 * claude-code-guide), and the three switches that remove them: `CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS`,
 * `CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS` (non-interactive mode and the SDK only) and the
 * `Agent(name)` deny rule (tested with the catalog, resolve.test.ts).
 */
import { describe, expect, test } from 'bun:test';
import {
  BUILTIN_AGENT_NAMES,
  builtinAgents,
  type BuiltinPolicy,
} from '../../../src/agents/catalog/builtin.ts';
import { spec } from '../../support/spec.ts';

const INTERACTIVE: BuiltinPolicy = {
  interactive: true,
  disableExplorePlan: false,
  disableAll: false,
};

const named = (policy: BuiltinPolicy, name: string) =>
  builtinAgents(policy).find((agent) => agent.name === name);

spec('agents.behavior.Built-in subagents', () => {
  test('the documented built-ins are registered by default in an interactive session', () => {
    expect(builtinAgents(INTERACTIVE).map((agent) => agent.name)).toEqual([...BUILTIN_AGENT_NAMES]);
    expect([...BUILTIN_AGENT_NAMES]).toEqual([
      'Explore',
      'Plan',
      'general-purpose',
      'claude',
      'statusline-setup',
      'claude-code-guide',
    ]);
  });

  test('every built-in is a catalog agent of the builtin source with a description', () => {
    for (const agent of builtinAgents(INTERACTIVE)) {
      expect(agent.source).toBe('builtin');
      expect(agent.definition.description).not.toBe('');
      expect(agent.path).toBeUndefined();
    }
  });

  test('Explore and Plan are read-only: Write and Edit are denied and no tool list narrows them', () => {
    for (const name of ['Explore', 'Plan']) {
      const { definition } = named(INTERACTIVE, name) ?? {};
      expect(definition?.disallowedTools).toEqual(['Write', 'Edit']);
      expect(definition?.tools).toBeUndefined();
    }
  });

  test('Explore and Plan start without CLAUDE.md files and the git status; the others load both', () => {
    for (const agent of builtinAgents(INTERACTIVE)) {
      const lean = agent.name === 'Explore' || agent.name === 'Plan';
      expect(agent.startsWith).toEqual({ claudeMd: !lean, gitStatus: !lean });
    }
  });

  test('general-purpose has every tool available to subagents: nothing is listed or denied', () => {
    const { definition } = named(INTERACTIVE, 'general-purpose') ?? {};
    expect(definition?.tools).toBeUndefined();
    expect(definition?.disallowedTools).toBeUndefined();
    expect(definition?.description).toContain('multi-step');
  });

  test('claude is a catch-all with every tool and no model of its own', () => {
    const { definition } = named(INTERACTIVE, 'claude') ?? {};
    expect(definition?.tools).toBeUndefined();
    expect(definition?.model).toBeUndefined();
  });

  test('statusline-setup runs on Sonnet and claude-code-guide on Haiku, the Other table', () => {
    expect(named(INTERACTIVE, 'statusline-setup')?.definition.model).toBe('sonnet');
    expect(named(INTERACTIVE, 'claude-code-guide')?.definition.model).toBe('haiku');
  });

  test('Explore, Plan and general-purpose follow the model order: no model of their own', () => {
    for (const name of ['Explore', 'Plan', 'general-purpose']) {
      expect(named(INTERACTIVE, name)?.definition.model).toBeUndefined();
    }
  });

  test('CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS removes only Explore and Plan', () => {
    const names = builtinAgents({ ...INTERACTIVE, disableExplorePlan: true }).map(
      (agent) => agent.name,
    );
    expect(names).toEqual(['general-purpose', 'claude', 'statusline-setup', 'claude-code-guide']);
  });

  test('CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS removes every built-in in non-interactive mode', () => {
    const policy: BuiltinPolicy = {
      interactive: false,
      disableExplorePlan: false,
      disableAll: true,
    };
    expect(builtinAgents(policy)).toEqual([]);
  });

  test('without that variable a non-interactive session has the built-ins too', () => {
    const policy: BuiltinPolicy = {
      interactive: false,
      disableExplorePlan: false,
      disableAll: false,
    };
    expect(builtinAgents(policy)).toHaveLength(BUILTIN_AGENT_NAMES.length);
  });
});

describe('judgments of the built-in registry (spec/judgments.md)', () => {
  test('the SDK variable does nothing in an interactive session: the page names it for non-interactive mode and the SDK', () => {
    expect(builtinAgents({ ...INTERACTIVE, disableAll: true })).toHaveLength(
      BUILTIN_AGENT_NAMES.length,
    );
  });

  test('both variables together leave nothing', () => {
    expect(
      builtinAgents({ interactive: false, disableExplorePlan: true, disableAll: true }),
    ).toEqual([]);
  });
});
