/**
 * sub-agents.md, "Disable specific subagents": `Agent(name)` deny rules in settings or
 * `--disallowedTools`, for built-in and custom subagents alike; a bare `Agent` deny rule stops
 * delegation to any subagent; the name is compared exactly.
 */
import { expect, test } from 'bun:test';
import { builtinAgents, type BuiltinPolicy } from '../../../src/agents/catalog/builtin.ts';
import { resolveAgents, resolveSubagentType } from '../../../src/agents/catalog/resolve.ts';
import { parsed } from '../../support/rule-context.ts';
import { spec } from '../../support/spec.ts';
import { scannedAgent } from '../../support/agent-catalog.ts';

const INTERACTIVE: BuiltinPolicy = {
  interactive: true,
  disableExplorePlan: false,
  disableAll: false,
};

spec('agents.behavior.Disable specific subagents', () => {
  const denied = [parsed('Agent(Explore)'), parsed('Agent(my-custom-agent)')];

  test('Agent(name) in permissions.deny removes the built-in and the custom subagent of that name', () => {
    const resolved = resolveAgents({
      builtin: builtinAgents(INTERACTIVE),
      scanned: [scannedAgent('project', 'my-custom-agent'), scannedAgent('project', 'kept')],
      denied,
    });
    const names = resolved.agents.map((agent) => agent.name);
    expect(names).not.toContain('Explore');
    expect(names).not.toContain('my-custom-agent');
    expect(names).toContain('kept');
    expect(names).toContain('Plan');
    expect(resolved.disabled.map((agent) => agent.name).toSorted()).toEqual([
      'Explore',
      'my-custom-agent',
    ]);
  });

  test('a call for a disabled subagent is refused, and the list it is given leaves it out', () => {
    const catalog = resolveAgents({ builtin: builtinAgents(INTERACTIVE), denied });
    const outcome = resolveSubagentType(catalog, 'Explore');
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.message).toBe(
      "Agent type 'Explore' not found. Available agents: Plan, claude, claude-code-guide, general-purpose, statusline-setup",
    );
  });

  test('the --disallowedTools flag takes the same rule', () => {
    const rule = parsed('Agent(Explore)', 'deny', { kind: 'cli' });
    const resolved = resolveAgents({ builtin: builtinAgents(INTERACTIVE), denied: [rule] });
    expect(resolved.agents.map((agent) => agent.name)).not.toContain('Explore');
  });

  test('an allow or ask rule disables nothing', () => {
    const resolved = resolveAgents({
      builtin: builtinAgents(INTERACTIVE),
      denied: [parsed('Agent(Explore)', 'allow'), parsed('Agent(Plan)', 'ask')],
    });
    expect(resolved.agents.map((agent) => agent.name)).toContain('Explore');
    expect(resolved.agents.map((agent) => agent.name)).toContain('Plan');
  });

  test('a rule for another tool is not about subagents', () => {
    const resolved = resolveAgents({
      builtin: builtinAgents(INTERACTIVE),
      denied: [parsed('Skill(Explore)'), parsed('Bash(Plan)')],
    });
    expect(resolved.agents.map((agent) => agent.name)).toContain('Explore');
  });

  test('denying the Agent tool itself prevents delegation to any subagent', () => {
    const resolved = resolveAgents({
      builtin: builtinAgents(INTERACTIVE),
      scanned: [scannedAgent('project', 'worker')],
      denied: [parsed('Agent')],
    });
    expect(resolved.delegation).toBe(false);
    expect(resolved.agents).toEqual([]);
    const outcome = resolveSubagentType(resolved, undefined);
    expect(outcome.ok).toBe(false);
  });

  test('Task(...) still works as an alias of Agent(...) in a deny rule (renamed in 2.1.63)', () => {
    const resolved = resolveAgents({
      builtin: builtinAgents(INTERACTIVE),
      scanned: [scannedAgent('project', 'worker')],
      denied: [parsed('Task(Explore)')],
    });
    const names = resolved.agents.map((agent) => agent.name);
    expect(names).not.toContain('Explore');
    expect(names).toContain('Plan');
    expect(names).toContain('worker');
    expect(resolved.disabled.map((agent) => agent.name)).toEqual(['Explore']);
    expect(resolved.delegation).toBe(true);
  });

  test('a bare Task deny rule is the Agent tool denied: no delegation to any subagent', () => {
    const resolved = resolveAgents({
      builtin: builtinAgents(INTERACTIVE),
      scanned: [scannedAgent('project', 'worker')],
      denied: [parsed('Task')],
    });
    expect(resolved.delegation).toBe(false);
    expect(resolved.agents).toEqual([]);
  });

  test('a Task allow or ask rule disables nothing, like an Agent one', () => {
    const resolved = resolveAgents({
      builtin: builtinAgents(INTERACTIVE),
      denied: [parsed('Task(Explore)', 'allow'), parsed('Task', 'ask')],
    });
    expect(resolved.delegation).toBe(true);
    expect(resolved.agents.map((agent) => agent.name)).toContain('Explore');
  });

  test('the name is compared exactly: Agent(explore) does not disable Explore', () => {
    const resolved = resolveAgents({
      builtin: builtinAgents(INTERACTIVE),
      denied: [parsed('Agent(explore)')],
    });
    expect(resolved.agents.map((agent) => agent.name)).toContain('Explore');
  });
});
