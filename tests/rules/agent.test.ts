/**
 * permissions.md § Agent (subagents) (`Agent(Explore)`, `Agent(Plan)`, `Agent(my-custom-agent)`) and
 * § Match by input parameter (`Agent(model:opus)` and the other parameters beside the name form);
 * sub-agents.md § Disable specific subagents (`Agent(subagent-name)` matches the subagent's name
 * field, in a deny rule or `--disallowedTools`); hooks.md § Agent (the input fields `subagent_type`,
 * `model`, `description`); tools-reference.md § Tools reference (Agent, rule format "subagent type").
 *
 * sub-agents.md § Turn fork mode off (`Agent(fork)` in `permissions.deny` stops forks).
 *
 * Where the docs are silent (case, wildcards, a call without `subagent_type`, how a fork call is
 * spelled, a plugin-qualified name) the test sits outside spec() and the choice is a row in
 * spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import type { AgentInput } from '../../src/protocol/official-tools.ts';
import { evaluateRules, parseRule } from '../../src/rules/index.ts';
import { call, matchContext, parsed } from '../support/rule-context.ts';
import { covers } from '../support/target-rules.ts';
import { spec } from '../support/spec.ts';

/** The SDK's own input: this file stops compiling when an Agent field leaves it (E2). */
const agent = (extra: Partial<AgentInput> = {}): AgentInput => ({
  description: 'Find API endpoints',
  prompt: 'Find all API endpoints',
  ...extra,
});

const BEHAVIORS = ['allow', 'ask', 'deny'] as const;
const verdict = (rules: ReturnType<typeof parsed>[], input: AgentInput) =>
  evaluateRules(rules, call('Agent', input), matchContext).behavior;

spec('tools.tool.Agent', () => {
  test('Agent(Explore) matches the Explore subagent and no other', () => {
    for (const behavior of BEHAVIORS) {
      expect(covers(behavior, 'Agent(Explore)', 'Agent', agent({ subagent_type: 'Explore' }))).toBe(
        true,
      );
      expect(covers(behavior, 'Agent(Explore)', 'Agent', agent({ subagent_type: 'Plan' }))).toBe(
        false,
      );
      expect(
        covers(behavior, 'Agent(Explore)', 'Agent', agent({ subagent_type: 'general-purpose' })),
      ).toBe(false);
    }
  });

  test('Agent(Plan) matches the Plan subagent', () => {
    expect(covers('deny', 'Agent(Plan)', 'Agent', agent({ subagent_type: 'Plan' }))).toBe(true);
    expect(covers('deny', 'Agent(Plan)', 'Agent', agent({ subagent_type: 'Explore' }))).toBe(false);
  });

  test('Agent(my-custom-agent) matches a custom subagent named my-custom-agent', () => {
    expect(
      covers(
        'deny',
        'Agent(my-custom-agent)',
        'Agent',
        agent({ subagent_type: 'my-custom-agent' }),
      ),
    ).toBe(true);
    expect(
      covers('deny', 'Agent(my-custom-agent)', 'Agent', agent({ subagent_type: 'my-custom' })),
    ).toBe(false);
    expect(
      covers(
        'deny',
        'Agent(my-custom-agent)',
        'Agent',
        agent({ subagent_type: 'my-custom-agent-2' }),
      ),
    ).toBe(false);
  });

  test('the documented deny list disables both subagents and leaves the rest', () => {
    const rules = [parsed('Agent(Explore)'), parsed('Agent(my-custom-agent)')];
    expect(verdict(rules, agent({ subagent_type: 'Explore' }))).toBe('deny');
    expect(verdict(rules, agent({ subagent_type: 'my-custom-agent' }))).toBe('deny');
    expect(verdict(rules, agent({ subagent_type: 'Plan' }))).toBe(undefined);
  });

  test('a bare Agent rule covers every subagent', () => {
    expect(covers('deny', 'Agent', 'Agent', agent({ subagent_type: 'Plan' }))).toBe(true);
    expect(covers('deny', 'Agent', 'Agent', agent())).toBe(true);
  });

  test('an Agent rule never covers another tool, even one with the same field', () => {
    expect(
      covers('deny', 'Agent(Explore)', 'Bash', { command: 'ls', subagent_type: 'Explore' }),
    ).toBe(false);
  });

  test('it is the same rule on the command line: --disallowedTools "Agent(Explore)"', () => {
    const { rule, issues } = parseRule('Agent(Explore)', {
      behavior: 'deny',
      source: { kind: 'cli' },
    });
    expect(issues).toEqual([]);
    expect(rule?.specifier).toEqual({ form: 'text', pattern: 'Explore' });
    const cliRules = rule === undefined ? [] : [rule];
    expect(verdict(cliRules, agent({ subagent_type: 'Explore' }))).toBe('deny');
    expect(verdict(cliRules, agent({ subagent_type: 'Plan' }))).toBe(undefined);
  });

  test('Agent(fork) in permissions.deny stops forks and leaves the other subagents', () => {
    const rules = [parsed('Agent(fork)')];
    expect(verdict(rules, agent({ subagent_type: 'fork' }))).toBe('deny');
    expect(verdict(rules, agent({ subagent_type: 'Explore' }))).toBe(undefined);
    expect(verdict(rules, agent({ subagent_type: 'forked' }))).toBe(undefined);
  });
});

spec('tools.input.Agent.subagent_type', () => {
  test('the name rule reads subagent_type', () => {
    expect(
      covers('deny', 'Agent(Explore)', 'Agent', {
        description: 'd',
        prompt: 'p',
        subagent_type: 'Explore',
      }),
    ).toBe(true);
    expect(
      covers('deny', 'Agent(Explore)', 'Agent', { description: 'Explore', prompt: 'Explore' }),
    ).toBe(false);
  });

  test('the parameter form Agent(subagent_type:Explore) reads the same field', () => {
    expect(
      covers('deny', 'Agent(subagent_type:Explore)', 'Agent', agent({ subagent_type: 'Explore' })),
    ).toBe(true);
    expect(
      covers('deny', 'Agent(subagent_type:Exp*)', 'Agent', agent({ subagent_type: 'Explore' })),
    ).toBe(true);
    expect(
      covers('deny', 'Agent(subagent_type:Explore)', 'Agent', agent({ subagent_type: 'Plan' })),
    ).toBe(false);
  });

  test('a call that leaves the field out matches neither form', () => {
    expect(covers('deny', 'Agent(subagent_type:*)', 'Agent', agent())).toBe(false);
  });
});

spec('tools.input.Agent.model', () => {
  test('the model parameter and the name are independent: each rule reads only its own field', () => {
    const call1 = agent({ subagent_type: 'Explore', model: 'sonnet' });
    expect(covers('deny', 'Agent(model:sonnet)', 'Agent', call1)).toBe(true);
    expect(covers('deny', 'Agent(Explore)', 'Agent', call1)).toBe(true);
    expect(covers('deny', 'Agent(model:opus)', 'Agent', call1)).toBe(false);
    expect(covers('deny', 'Agent(sonnet)', 'Agent', call1)).toBe(false);
  });

  test('the model alias is the literal value, whichever subagent is named', () => {
    expect(
      covers('deny', 'Agent(model:opus)', 'Agent', agent({ subagent_type: 'Plan', model: 'opus' })),
    ).toBe(true);
    expect(covers('deny', 'Agent(model:opus)', 'Agent', agent({ subagent_type: 'Plan' }))).toBe(
      false,
    );
  });
});

spec('tools.input.Agent.description', () => {
  test('a description parameter rule matches the literal description, with * as a wildcard', () => {
    const input = agent({ description: 'Run production deploy' });
    expect(covers('deny', 'Agent(description:*deploy*)', 'Agent', input)).toBe(true);
    expect(covers('deny', 'Agent(description:Run production deploy)', 'Agent', input)).toBe(true);
    expect(covers('deny', 'Agent(description:deploy*)', 'Agent', input)).toBe(false);
  });

  test('the name rule does not read the description', () => {
    expect(
      covers(
        'deny',
        'Agent(Run production deploy)',
        'Agent',
        agent({ description: 'Run production deploy' }),
      ),
    ).toBe(false);
  });
});

describe('what the docs leave open about Agent rules (spec/judgments.md)', () => {
  test('the name is exact and case-sensitive, and * is a literal character', () => {
    expect(covers('deny', 'Agent(Explore)', 'Agent', agent({ subagent_type: 'explore' }))).toBe(
      false,
    );
    expect(covers('deny', 'Agent(Exp*)', 'Agent', agent({ subagent_type: 'Explore' }))).toBe(false);
    expect(covers('deny', 'Agent(Exp*)', 'Agent', agent({ subagent_type: 'Exp*' }))).toBe(true);
  });

  test('a call without subagent_type is general-purpose for a deny or ask rule, no name for an allow rule', () => {
    for (const behavior of ['ask', 'deny'] as const) {
      expect(covers(behavior, 'Agent(general-purpose)', 'Agent', agent())).toBe(true);
      expect(covers(behavior, 'Agent(Explore)', 'Agent', agent())).toBe(false);
    }
    expect(covers('allow', 'Agent(general-purpose)', 'Agent', agent())).toBe(false);
    expect(covers('allow', 'Agent(Explore)', 'Agent', agent())).toBe(false);
  });

  test('a fork is the call whose subagent_type is fork, and Agent(fork) names it literally', () => {
    for (const behavior of BEHAVIORS) {
      expect(covers(behavior, 'Agent(fork)', 'Agent', agent({ subagent_type: 'fork' }))).toBe(true);
    }
    expect(covers('deny', 'Agent(fork)', 'Agent', agent())).toBe(false);
  });

  test('a plugin-qualified name is a name, not a parameter rule on a field called after the plugin', () => {
    const { rule } = parseRule('Agent(acme:reviewer)', {
      behavior: 'deny',
      source: { kind: 'user' },
    });
    expect(rule?.specifier).toEqual({ form: 'text', pattern: 'acme:reviewer' });
    expect(
      covers('deny', 'Agent(acme:reviewer)', 'Agent', agent({ subagent_type: 'acme:reviewer' })),
    ).toBe(true);
    expect(
      covers('deny', 'Agent(acme:reviewer)', 'Agent', agent({ subagent_type: 'reviewer' })),
    ).toBe(false);
  });

  test('every field of the official input still reads as a parameter', () => {
    const input = agent({
      subagent_type: 'Plan',
      isolation: 'worktree',
      run_in_background: true,
      effort: 'high',
      name: 'n',
    });
    for (const text of ['isolation:worktree', 'run_in_background:true', 'effort:high', 'name:n']) {
      expect([text, covers('deny', `Agent(${text})`, 'Agent', input)]).toEqual([text, true]);
    }
  });
});
