import { builtinModelAlias, type BuiltinModelInput } from './builtin-model.ts';
import { EFFORT_LEVELS } from '../protocol/effort.ts';
import type { AgentDefinition, EffortLevel } from '../protocol/official.ts';

/**
 * Which model a subagent runs on, and at which effort (sub-agents.md, "Choose a model", "Run
 * every subagent on one model" and "Choose an effort level"). Both are small decisions over
 * values the host passes: the kit reads no environment variable. Turning an alias into a version,
 * the `availableModels` allowlist and the effort levels a model supports are the host's.
 */

/** The family aliases an Agent tool call's `model` parameter takes (sub-agents.md, "Choose a model"). */
export const MODEL_ALIASES = ['sonnet', 'opus', 'haiku', 'fable'] as const;
export type ModelAlias = (typeof MODEL_ALIASES)[number];

const isAlias = (value: string | undefined): value is ModelAlias =>
  MODEL_ALIASES.some((alias) => alias === value);

/** Where the chosen model came from. */
export type ModelSource = 'invocation' | 'definition' | 'env' | 'builtin' | 'main';

export interface SubagentModelInput {
  /** The `model` parameter of this Agent tool call: an alias ("Claude can't pass a full model ID or `inherit`"). */
  readonly invocation?: string | undefined;
  /**
   * The model an installed mod set in its `agent.spawn` hook: "Claude Code uses that model in place of
   * the per-invocation parameter". Any model the mod names counts (it is no Claude call, so the alias
   * limit of the parameter does not bind it); judgment: ignored while the model is forced, because the
   * docs say only Claude's own call is withdrawn there.
   */
  readonly modModel?: string | undefined;
  /** The definition's `model`: an alias, a full model ID or `inherit`. */
  readonly definition?: string | undefined;
  /** `CLAUDE_CODE_SUBAGENT_MODEL`. */
  readonly envModel?: string | undefined;
  /** `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` is `1`. */
  readonly force?: boolean | undefined;
  /** The main conversation's model, exactly (`[1m]` suffix included). */
  readonly mainModel: string;
  /** The main model's family (`opus`, `sonnet`...); undefined when Claude Code cannot tell it on another provider. */
  readonly mainFamily?: string | undefined;
  /** `ANTHROPIC_DEFAULT_OPUS_MODEL` is set, so `opus` means the model you set. */
  readonly opusPinned?: boolean | undefined;
  /**
   * Set when the subagent is a built-in (not a user or project agent of the same name, which keeps its
   * own `model`): its name and how the session connects. Explore on a Fable main conversation runs on
   * the `opus` alias over a subscription, Console or LLM gateway ("Built-in subagents").
   */
  readonly builtin?: BuiltinModelInput | undefined;
}

export interface SubagentModel {
  /** An alias or a full model ID; the host resolves an alias to its version. */
  readonly model: string;
  readonly from: ModelSource;
}

const INHERIT = 'inherit';
/** The one alias that follows the main model when its family cannot be told. */
const UNKNOWN_FAMILY_ALIAS: ModelAlias = 'opus';

const written = (value: string | undefined): string | undefined => {
  const text = value?.trim();
  return text === undefined || text === '' ? undefined : text;
};

/**
 * Whether a family alias resolves to the main conversation's model: "The main conversation's
 * model belongs to that family", or its family cannot be told, which "covers only the `opus`
 * alias, and doesn't apply when you set `ANTHROPIC_DEFAULT_OPUS_MODEL`".
 */
function meansMainModel(alias: ModelAlias, input: SubagentModelInput): boolean {
  if (input.mainFamily !== undefined) return input.mainFamily === alias;
  return alias === UNKNOWN_FAMILY_ALIAS && input.opusPinned !== true;
}

const aliasOrMain = (alias: string, input: SubagentModelInput): string =>
  isAlias(alias) && meansMainModel(alias, input) ? input.mainModel : alias;

type Pick = (input: SubagentModelInput) => string | undefined;

const PICKS: { readonly [S in ModelSource]: Pick } = {
  // Judgment: a value that is no alias is not something Claude can pass, so it counts as unset.
  invocation: (input) => {
    const mod = written(input.modModel);
    if (mod !== undefined) return aliasOrMain(mod, input);
    const value = written(input.invocation);
    return isAlias(value) ? aliasOrMain(value, input) : undefined;
  },
  // "the subagent definition's `model` frontmatter, where `inherit` selects the main conversation's model"
  definition: (input) => {
    const value = written(input.definition);
    if (value === undefined) return undefined;
    return value === INHERIT ? input.mainModel : aliasOrMain(value, input);
  },
  // "Setting the variable to `inherit` is the same as leaving it unset."; an alias there is never replaced.
  env: (input) => {
    const value = written(input.envModel);
    return value === INHERIT ? undefined : value;
  },
  builtin: (input) => builtinModelAlias(input.builtin, input.mainFamily),
  main: (input) => input.mainModel,
};

const ORDER: readonly ModelSource[] = ['invocation', 'definition', 'env', 'builtin', 'main'];
/** "While `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` is on, Claude Code ignores the `model` field ... and Claude can't pass a model." */
const FORCED_ORDER: readonly ModelSource[] = ['env', 'builtin', 'main'];

/** The model a subagent runs on, in "the subagent model order" of sub-agents.md. */
export function resolveSubagentModel(input: SubagentModelInput): SubagentModel {
  for (const from of input.force === true ? FORCED_ORDER : ORDER) {
    const model = PICKS[from](input);
    if (model !== undefined) return { model, from };
  }
  return { model: input.mainModel, from: 'main' };
}

/** What `CLAUDE_CODE_EFFORT_LEVEL` says when "Claude Code send[s] no effort level". */
const NO_EFFORT = ['auto', 'unset'] as const;

const asLevel = (value: string | undefined): EffortLevel | undefined =>
  EFFORT_LEVELS.find((level) => level === value);

export interface SubagentEffortInput {
  /** `CLAUDE_CODE_EFFORT_LEVEL`: a level, or `auto` / `unset`. */
  readonly env?: string | undefined;
  /** The `effort` parameter of this Agent tool call (a non-fork subagent only). */
  readonly invocation?: string | undefined;
  /** The definition's `effort`. */
  readonly field?: AgentDefinition['effort'];
  /** The level picked in the session (`/effort`, `--effort`, settings). */
  readonly session?: string | undefined;
  /** The subagent runs on the main conversation's model. */
  readonly sameModelAsMain: boolean;
}

/**
 * The effort a subagent runs at: the environment variable, then the invocation parameter, then
 * the `effort` field, then the session level only "on the main conversation's model" ("On another
 * model, that level doesn't apply"). `undefined` sends no level. The variable set to `auto` or
 * `unset` sends none, whatever the others say, because it "takes precedence over both".
 */
export function resolveSubagentEffort(
  input: SubagentEffortInput,
): EffortLevel | number | undefined {
  if (NO_EFFORT.some((value) => value === input.env)) return undefined;
  const session = input.sameModelAsMain ? asLevel(input.session) : undefined;
  // Judgment: a variable or parameter that names no level is ignored.
  return [asLevel(input.env), asLevel(input.invocation), input.field, session].find(
    (level) => level !== undefined,
  );
}
