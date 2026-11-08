/**
 * sub-agents.md, "Built-in subagents" (Explore tab): "When the main conversation runs Fable, Explore's
 * model depends on how you connect". Over a subscription, a Console account or an LLM gateway Explore
 * runs on the `opus` alias; on Bedrock, Vertex, Foundry, Claude Platform on AWS or a Claude apps
 * gateway it stays on the main conversation's model. A user or project `Explore` keeps its own model.
 */
import { describe, expect, test } from 'bun:test';
import { CONNECTIONS, type Connection } from '../../../src/agents/builtin-model.ts';
import { resolveSubagentModel } from '../../../src/agents/launch-model.ts';
import { spec } from '../../support/spec.ts';

const FABLE = 'claude-fable-1';
const fableMain = { mainModel: FABLE, mainFamily: 'fable' } as const;
const explore = (connection: Connection) => ({ name: 'Explore', connection });

spec('agents.behavior.Built-in subagents', () => {
  test.each(['subscription', 'console', 'llm-gateway'] as const)(
    'Explore runs on the opus alias when the main model is Fable and the connection is %s',
    (connection) => {
      expect(resolveSubagentModel({ ...fableMain, builtin: explore(connection) })).toEqual({
        model: 'opus',
        from: 'builtin',
      });
    },
  );

  test.each([
    'bedrock',
    'vertex',
    'foundry',
    'claude-platform-on-aws',
    'claude-apps-gateway',
  ] as const)(
    'Explore stays on the main model when the main model is Fable and the connection is %s',
    (connection) => {
      expect(resolveSubagentModel({ ...fableMain, builtin: explore(connection) })).toEqual({
        model: FABLE,
        from: 'main',
      });
    },
  );

  test('every connection kind is decided: none leaves Fable unanswered', () => {
    for (const connection of CONNECTIONS) {
      const { model } = resolveSubagentModel({ ...fableMain, builtin: explore(connection) });
      expect([FABLE, 'opus']).toContain(model);
    }
  });

  test('with another main model Explore follows it, whatever the connection', () => {
    const sonnet = { mainModel: 'claude-sonnet-5-5', mainFamily: 'sonnet' } as const;
    for (const connection of CONNECTIONS) {
      expect(resolveSubagentModel({ ...sonnet, builtin: explore(connection) })).toEqual({
        model: sonnet.mainModel,
        from: 'main',
      });
    }
  });

  test('the other built-ins follow the main model even on Fable', () => {
    for (const name of ['Plan', 'general-purpose', 'claude']) {
      expect(
        resolveSubagentModel({ ...fableMain, builtin: { name, connection: 'subscription' } }),
      ).toEqual({ model: FABLE, from: 'main' });
    }
  });

  test('without the built-in input (a user or project Explore) the rule does not apply', () => {
    expect(resolveSubagentModel(fableMain)).toEqual({ model: FABLE, from: 'main' });
    expect(resolveSubagentModel({ ...fableMain, definition: 'haiku' })).toEqual({
      model: 'haiku',
      from: 'definition',
    });
  });
});

describe('the order around the Explore rule (spec/judgments.md)', () => {
  test('CLAUDE_CODE_SUBAGENT_MODEL and a model passed on the call come before the rule', () => {
    const input = { ...fableMain, builtin: explore('subscription') };
    expect(resolveSubagentModel({ ...input, envModel: 'haiku' })).toEqual({
      model: 'haiku',
      from: 'env',
    });
    expect(resolveSubagentModel({ ...input, invocation: 'sonnet' })).toEqual({
      model: 'sonnet',
      from: 'invocation',
    });
  });

  test('FORCE with the variable unset still applies the rule', () => {
    expect(
      resolveSubagentModel({ ...fableMain, force: true, builtin: explore('console') }).model,
    ).toBe('opus');
  });
});
