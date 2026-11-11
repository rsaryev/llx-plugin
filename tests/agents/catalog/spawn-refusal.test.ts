/**
 * sub-agents.md, "Restrict which subagents can be spawned": `Agent(worker, researcher)` "is an
 * allowlist: only the `worker` and `researcher` subagents can be spawned. If the agent tries to spawn
 * any other type, the request fails and the agent sees only the allowed types in its prompt";
 * `Agent` alone allows any; without `Agent` "the agent can't spawn any subagents". `spawnRefusal`
 * is that refusal for one call, worded as `resolveSubagentType` over `spawnableAgents` words it.
 * Judgment (spec/judgments.md): a call without `subagent_type` is `general-purpose` and a fork is
 * the type `fork`, both compared exactly as `Agent(Name)` rules compare.
 */
import { describe, expect, test } from 'bun:test';
import { resolveAgents } from '../../../src/agents/catalog/resolve.ts';
import { spawnRefusal } from '../../../src/agents/catalog/spawn.ts';
import { builtinAgents } from '../../../src/agents/catalog/builtin.ts';
import { spec } from '../../support/spec.ts';
import { pluginAgent, scannedAgent } from '../../support/agent-catalog.ts';

const catalog = resolveAgents({
  builtin: builtinAgents({ interactive: true, disableExplorePlan: false, disableAll: false }),
  scanned: [scannedAgent('project', 'worker'), scannedAgent('project', 'researcher')],
  plugin: [pluginAgent('tools', 'lint')],
});

spec('agents.behavior.Restrict which subagents can be spawned', () => {
  test('a listed type is not refused', () => {
    expect(spawnRefusal(catalog, ['worker', 'researcher'], 'worker')).toBeUndefined();
  });

  test('any other type fails with the allowed types only', () => {
    expect(spawnRefusal(catalog, ['worker', 'researcher'], 'Explore')).toBe(
      "Agent type 'Explore' not found. Available agents: researcher, worker",
    );
  });

  test('Agent alone allows any type; no Agent tool allows none', () => {
    expect(spawnRefusal(catalog, 'any', 'Explore')).toBeUndefined();
    expect(spawnRefusal(catalog, 'none', 'worker')).toBe('The Agent tool is not available');
  });
});

describe('spawnRefusal: an omitted type and a fork (judgment)', () => {
  test('a call without subagent_type is general-purpose, which the list must name', () => {
    expect(spawnRefusal(catalog, ['general-purpose'], undefined)).toBeUndefined();
    expect(spawnRefusal(catalog, ['worker'], undefined)).toBe(
      'subagent_type is required: the general-purpose agent is not available in this session. Available agents: worker',
    );
  });

  test('a fork is the type fork, compared exactly', () => {
    expect(spawnRefusal(catalog, ['fork'], 'fork')).toBeUndefined();
    expect(spawnRefusal(catalog, ['Worker'], 'worker')).toBe(
      "Agent type 'worker' not found. Available agents: ",
    );
  });

  test('a plugin agent is listed by its scoped name', () => {
    expect(spawnRefusal(catalog, ['tools:lint'], 'tools:lint')).toBeUndefined();
    expect(spawnRefusal(catalog, ['lint'], 'tools:lint')).toBeDefined();
  });
});
