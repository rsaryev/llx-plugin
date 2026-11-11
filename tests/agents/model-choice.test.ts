/**
 * sub-agents.md § Choose a model (the three forms, the order of the four sources, a mod's
 * `agent.spawn` model, the family alias rule, the `availableModels` allowlist), § Run every subagent on
 * one model (`CLAUDE_CODE_SUBAGENT_MODEL_FORCE`) and § When a subagent has no `effort` field or
 * parameter. The model order is `resolveSubagentModel`'s; the checks of values and of the allowlist
 * are `model-choice.ts`'s.
 */
import { describe, expect, test } from 'bun:test';
import { resolveSubagentEffort, resolveSubagentModel } from '../../src/agents/launch-model.ts';
import {
  checkAgainstAllowlist,
  modelValueAccepted,
  type ModelAllowlist,
} from '../../src/agents/model-choice.ts';
import { modelValueKind } from '../../src/agents/model-value.ts';
import { spec } from '../support/spec.ts';

const MAIN = 'claude-sonnet-5-5';
const base = { mainModel: MAIN, mainFamily: 'sonnet' } as const;

spec('agents.behavior.Choose a model.Model alias', () => {
  test('sonnet, opus, haiku and fable are the aliases, in the field and in an Agent call', () => {
    for (const alias of ['sonnet', 'opus', 'haiku', 'fable']) {
      expect(modelValueKind(alias)).toBe('alias');
      expect(modelValueAccepted('frontmatter', alias)).toBe(true);
      expect(modelValueAccepted('invocation', alias)).toBe(true);
    }
  });

  test('an alias of a family other than the main model resolves to that alias, for the host to turn into a version', () => {
    expect(resolveSubagentModel({ definition: 'haiku', ...base })).toEqual({
      model: 'haiku',
      from: 'definition',
      kind: 'alias',
    });
    expect(resolveSubagentModel({ invocation: 'opus', ...base })).toEqual({
      model: 'opus',
      from: 'invocation',
      kind: 'alias',
    });
  });

  test('a name that is none of the aliases is not an alias', () => {
    expect(modelValueKind('gpt')).not.toBe('alias');
    expect(modelValueKind('Sonnet')).not.toBe('alias');
  });
});

spec('agents.behavior.Choose a model.Full model ID', () => {
  test('a full model ID is accepted in the definition and kept as written', () => {
    for (const id of ['claude-opus-5-5', 'claude-sonnet-5']) {
      expect(modelValueKind(id)).toBe('full-id');
      expect(modelValueAccepted('frontmatter', id)).toBe(true);
      expect(resolveSubagentModel({ definition: id, ...base })).toEqual({
        model: id,
        from: 'definition',
        kind: 'full-id',
      });
    }
  });

  test('Claude cannot pass a full model ID on an Agent call', () => {
    expect(modelValueAccepted('invocation', 'claude-opus-5-5')).toBe(false);
    // The call's value is then not one Claude could have passed: the definition decides.
    expect(
      resolveSubagentModel({ invocation: 'claude-opus-5-5', definition: 'haiku', ...base }),
    ).toEqual({ model: 'haiku', from: 'definition', kind: 'alias' });
  });

  test('an ID with a [1m] suffix, as the --model flag takes it, is kept whole', () => {
    expect(resolveSubagentModel({ definition: 'claude-opus-5-5[1m]', ...base }).model).toBe(
      'claude-opus-5-5[1m]',
    );
  });
});

spec('agents.behavior.Choose a model.inherit', () => {
  test('inherit selects the main conversation model, ahead of the environment variable', () => {
    expect(modelValueKind('inherit')).toBe('inherit');
    expect(resolveSubagentModel({ definition: 'inherit', envModel: 'haiku', ...base })).toEqual({
      model: MAIN,
      from: 'definition',
      kind: 'inherit',
    });
  });

  test('the field takes inherit and an Agent call cannot pass it', () => {
    expect(modelValueAccepted('frontmatter', 'inherit')).toBe(true);
    expect(modelValueAccepted('invocation', 'inherit')).toBe(false);
    expect(
      resolveSubagentModel({ invocation: 'inherit', definition: 'haiku', ...base }).model,
    ).toBe('haiku');
  });

  test('CLAUDE_CODE_SUBAGENT_MODEL set to inherit is the same as leaving it unset', () => {
    expect(resolveSubagentModel({ envModel: 'inherit', ...base })).toEqual(
      resolveSubagentModel(base),
    );
  });
});

spec('agents.behavior.Choose a model', () => {
  const all = { invocation: 'haiku', definition: 'opus', envModel: 'fable', ...base };

  test('the order: the call, the definition, the environment variable, the main model', () => {
    expect(resolveSubagentModel(all).from).toBe('invocation');
    expect(resolveSubagentModel({ ...all, invocation: undefined }).from).toBe('definition');
    expect(
      resolveSubagentModel({ ...all, invocation: undefined, definition: undefined }).from,
    ).toBe('env');
    expect(resolveSubagentModel(base).from).toBe('main');
  });

  test('a model a mod sets in its agent.spawn hook is used in place of the per-invocation parameter', () => {
    expect(resolveSubagentModel({ ...all, modModel: 'claude-haiku-5' })).toEqual({
      model: 'claude-haiku-5',
      from: 'invocation',
      kind: 'full-id',
    });
    // Without a call parameter the mod's model still takes the first place.
    expect(resolveSubagentModel({ ...base, definition: 'opus', modModel: 'haiku' }).model).toBe(
      'haiku',
    );
  });

  test('a family alias that names the main conversation family runs on its exact model, [1m] included', () => {
    const main = { mainModel: 'claude-opus-5-5[1m]', mainFamily: 'opus' } as const;
    expect(resolveSubagentModel({ definition: 'opus', ...main }).model).toBe('claude-opus-5-5[1m]');
    expect(resolveSubagentModel({ invocation: 'opus', ...main }).model).toBe('claude-opus-5-5[1m]');
  });

  test('on a provider where the family cannot be told, only opus follows the main model, unless ANTHROPIC_DEFAULT_OPUS_MODEL is set', () => {
    const arn = { mainModel: 'arn:aws:bedrock:profile/abc' } as const;
    expect(resolveSubagentModel({ definition: 'opus', ...arn }).model).toBe(arn.mainModel);
    expect(resolveSubagentModel({ definition: 'sonnet', ...arn }).model).toBe('sonnet');
    expect(resolveSubagentModel({ definition: 'opus', opusPinned: true, ...arn }).model).toBe(
      'opus',
    );
  });

  test('an alias in the environment variable always resolves to the alias, even for the main family', () => {
    expect(resolveSubagentModel({ envModel: 'sonnet', ...base }).model).toBe('sonnet');
  });

  describe('the allowlist substitutes a blocked value', () => {
    const allow = (permitted: readonly string[], newest: Record<string, string> = {}) =>
      ({
        permits: (model) => permitted.includes(model),
        newestPermitted: (family) => newest[family],
      }) satisfies ModelAllowlist;

    test('a blocked family alias runs on the newest version of the family the allowlist permits', () => {
      const allowlist = allow([MAIN], { opus: 'claude-opus-4-1' });
      expect(checkAgainstAllowlist({ chosen: 'opus', inherited: MAIN, allowlist })).toEqual({
        model: 'claude-opus-4-1',
        replaced: { requested: 'opus', running: 'claude-opus-4-1' },
      });
    });

    test('any other blocked value, or a family with no permitted version, runs on the inherited model', () => {
      const allowlist = allow([MAIN]);
      for (const chosen of ['claude-opus-5-5', 'opus']) {
        expect(checkAgainstAllowlist({ chosen, inherited: MAIN, allowlist })).toEqual({
          model: MAIN,
          replaced: { requested: chosen, running: MAIN },
        });
      }
    });

    test('CLAUDE_CODE_SUBAGENT_MODEL is tried first, under the same rules, before the inherited model', () => {
      const allowlist = allow([MAIN, 'claude-haiku-5']);
      expect(
        checkAgainstAllowlist({
          chosen: 'claude-opus-5-5',
          envModel: 'claude-haiku-5',
          inherited: MAIN,
          allowlist,
        }).model,
      ).toBe('claude-haiku-5');
      expect(
        checkAgainstAllowlist({
          chosen: 'claude-opus-5-5',
          envModel: 'claude-fable-5',
          inherited: MAIN,
          allowlist,
        }).model,
      ).toBe(MAIN);
    });

    test('a permitted value, and a session without an allowlist, change nothing and warn of nothing', () => {
      expect(
        checkAgainstAllowlist({ chosen: 'haiku', inherited: MAIN, allowlist: allow(['haiku']) }),
      ).toEqual({ model: 'haiku' });
      expect(checkAgainstAllowlist({ chosen: 'opus', inherited: MAIN })).toEqual({ model: 'opus' });
    });
  });
});

spec('agents.behavior.Run every subagent on one model', () => {
  const choices = { invocation: 'opus', definition: 'haiku', ...base };

  test('without FORCE the variable is a default: the definition and the call still win', () => {
    expect(resolveSubagentModel({ ...choices, envModel: 'fable' }).from).toBe('invocation');
    expect(resolveSubagentModel({ definition: 'haiku', envModel: 'fable', ...base }).from).toBe(
      'definition',
    );
  });

  test('both variables: every subagent runs on the model in CLAUDE_CODE_SUBAGENT_MODEL, whatever its definition or call says', () => {
    expect(resolveSubagentModel({ ...choices, envModel: 'haiku', force: true })).toEqual({
      model: 'haiku',
      from: 'env',
      kind: 'alias',
    });
    expect(
      resolveSubagentModel({ ...choices, definition: 'inherit', envModel: 'haiku', force: true })
        .model,
    ).toBe('haiku');
  });

  test('only FORCE: subagents run on the main conversation model, the definition model ignored', () => {
    expect(resolveSubagentModel({ ...choices, force: true })).toEqual({
      model: MAIN,
      from: 'main',
      kind: 'inherit',
    });
  });

  test('only FORCE: the built-in Explore keeps the model listed for it', () => {
    const fable = { mainModel: 'claude-fable-5', mainFamily: 'fable' } as const;
    const explore = { name: 'Explore', connection: 'subscription' } as const;
    expect(
      resolveSubagentModel({ ...fable, builtin: explore, definition: 'haiku', force: true }),
    ).toEqual({ model: 'opus', from: 'builtin', kind: 'alias' });
    expect(
      resolveSubagentModel({
        ...fable,
        builtin: { name: 'Plan', connection: 'subscription' },
        force: true,
      }),
    ).toEqual({ model: 'claude-fable-5', from: 'main', kind: 'inherit' });
  });
});

spec('agents.behavior.When a subagent has no effort field or parameter', () => {
  test('on the main conversation model it runs at the level picked in the session', () => {
    expect(resolveSubagentEffort({ session: 'high', sameModelAsMain: true })).toBe('high');
  });

  test('on another model the session level does not apply, so the effort field is the way to choose', () => {
    expect(resolveSubagentEffort({ session: 'high', sameModelAsMain: false })).toBeUndefined();
    expect(resolveSubagentEffort({ session: 'high', field: 'low', sameModelAsMain: false })).toBe(
      'low',
    );
  });

  test('the field and the call still win over the session level on the main model', () => {
    expect(resolveSubagentEffort({ session: 'high', field: 'low', sameModelAsMain: true })).toBe(
      'low',
    );
    expect(
      resolveSubagentEffort({ session: 'high', invocation: 'medium', sameModelAsMain: true }),
    ).toBe('medium');
  });
});
