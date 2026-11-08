/**
 * sub-agents.md, "Choose a model" (the subagent model order, the family alias rule, `inherit`,
 * the `CLAUDE_CODE_SUBAGENT_MODEL` variable) and "Run every subagent on one model"
 * (`CLAUDE_CODE_SUBAGENT_MODEL_FORCE`), with the `model` row of "Frontmatter reference". The kit
 * owns the choice of the model string; resolving an alias to a version, the `availableModels`
 * allowlist substitution and the `/tasks` display are the host's.
 */
import { describe, expect, test } from 'bun:test';
import { resolveSubagentModel } from '../../src/agents/launch-model.ts';
import { agentWith } from '../support/launch.ts';
import { spec } from '../support/spec.ts';

const MAIN = 'claude-sonnet-5-5';
const base = { mainModel: MAIN, mainFamily: 'sonnet' } as const;

spec(
  [
    'agents.frontmatter.model',
    'environment.host.CLAUDE_CODE_SUBAGENT_MODEL',
    'environment.host.CLAUDE_CODE_SUBAGENT_MODEL_FORCE',
  ],
  () => {
    test('the order is the invocation parameter, the definition, the environment variable, the main model', () => {
      const all = { invocation: 'haiku', definition: 'opus', envModel: 'fable', ...base };
      expect(resolveSubagentModel(all)).toEqual({ model: 'haiku', from: 'invocation' });
      expect(resolveSubagentModel({ ...all, invocation: undefined })).toEqual({
        model: 'opus',
        from: 'definition',
      });
      expect(
        resolveSubagentModel({ ...all, invocation: undefined, definition: undefined }),
      ).toEqual({
        model: 'fable',
        from: 'env',
      });
      expect(resolveSubagentModel(base)).toEqual({ model: MAIN, from: 'main' });
    });

    test('the definition beats the environment variable (before v2.1.251 it did not)', () => {
      expect(
        resolveSubagentModel({ definition: 'claude-opus-5-5', envModel: 'haiku', ...base }),
      ).toEqual({ model: 'claude-opus-5-5', from: 'definition' });
    });

    test('`inherit` in the definition selects the main conversation model, and the variable is not consulted', () => {
      expect(resolveSubagentModel({ definition: 'inherit', envModel: 'haiku', ...base })).toEqual({
        model: MAIN,
        from: 'definition',
      });
    });

    test('the variable set to `inherit` is the same as unset', () => {
      expect(resolveSubagentModel({ envModel: 'inherit', ...base })).toEqual(
        resolveSubagentModel(base),
      );
    });

    test('a full model ID in the definition is used as written, even with the main model in its family', () => {
      expect(resolveSubagentModel({ definition: 'claude-sonnet-5', ...base })).toEqual({
        model: 'claude-sonnet-5',
        from: 'definition',
      });
    });

    test('a family alias of the main conversation model resolves to its exact model, [1m] included', () => {
      const main = { mainModel: 'claude-opus-5-5[1m]', mainFamily: 'opus' } as const;
      expect(resolveSubagentModel({ definition: 'opus', ...main }).model).toBe(
        'claude-opus-5-5[1m]',
      );
      expect(resolveSubagentModel({ invocation: 'opus', ...main }).model).toBe(
        'claude-opus-5-5[1m]',
      );
    });

    test('an alias of another family stays the alias', () => {
      expect(resolveSubagentModel({ definition: 'haiku', ...base }).model).toBe('haiku');
      expect(resolveSubagentModel({ invocation: 'fable', ...base }).model).toBe('fable');
    });

    test('an alias in the variable always resolves to the version it points to, even for the main family', () => {
      expect(resolveSubagentModel({ envModel: 'sonnet', ...base })).toEqual({
        model: 'sonnet',
        from: 'env',
      });
    });

    test('when the main family cannot be told (another provider), only `opus` resolves to the main model', () => {
      const unknown = { mainModel: 'arn:aws:bedrock:profile/abc' } as const;
      expect(resolveSubagentModel({ definition: 'opus', ...unknown }).model).toBe(
        unknown.mainModel,
      );
      expect(resolveSubagentModel({ definition: 'sonnet', ...unknown }).model).toBe('sonnet');
    });

    test('...unless ANTHROPIC_DEFAULT_OPUS_MODEL is set: `opus` then means the model you set', () => {
      const unknown = { mainModel: 'arn:aws:bedrock:profile/abc', opusPinned: true } as const;
      expect(resolveSubagentModel({ definition: 'opus', ...unknown }).model).toBe('opus');
    });

    test('FORCE ignores the definition and the invocation: the variable, else the main model', () => {
      const forced = { force: true, invocation: 'opus', definition: 'haiku', ...base } as const;
      expect(resolveSubagentModel({ ...forced, envModel: 'haiku' })).toEqual({
        model: 'haiku',
        from: 'env',
      });
      expect(resolveSubagentModel(forced)).toEqual({ model: MAIN, from: 'main' });
    });

    test('each documented model value reads from a file and resolves', () => {
      // A main model whose family cannot be told, with `opus` pinned: every alias stays an alias.
      // (For a Sonnet main model `sonnet` would be its exact ID, tested above.)
      const unpinned = { mainModel: MAIN, opusPinned: true } as const;
      const expected = {
        sonnet: 'sonnet',
        opus: 'opus',
        haiku: 'haiku',
        fable: 'fable',
        'claude-opus-5-5': 'claude-opus-5-5',
        inherit: MAIN,
      } as const;
      for (const [model, resolvedModel] of Object.entries(expected)) {
        const definition = agentWith(`model: ${model}`).definition.model;
        expect(resolveSubagentModel({ definition, ...unpinned })).toEqual({
          model: resolvedModel,
          from: 'definition',
        });
      }
    });

    test('a definition with no model leaves the choice to the variable or the main model', () => {
      const { model } = agentWith('').definition;
      expect(resolveSubagentModel({ definition: model, envModel: 'haiku', ...base }).from).toBe(
        'env',
      );
    });
  },
);

describe('judgments (spec/judgments.md)', () => {
  test('the invocation parameter takes only an alias: a full ID or `inherit` is not something Claude can pass', () => {
    expect(
      resolveSubagentModel({ invocation: 'claude-opus-5-5', definition: 'haiku', ...base }),
    ).toEqual({
      model: 'haiku',
      from: 'definition',
    });
    expect(resolveSubagentModel({ invocation: 'inherit', ...base }).from).toBe('main');
  });

  test('an empty value counts as unset', () => {
    expect(resolveSubagentModel({ definition: '  ', envModel: '', ...base }).from).toBe('main');
  });
});
