import { MODEL_ALIASES, type ModelAlias } from './launch-model.ts';

/**
 * What a `model` value is, who may write which kind, and what happens to a value the organization's
 * `availableModels` allowlist blocks (sub-agents.md, "Choose a model"). The order of the sources is
 * `resolveSubagentModel`'s; this file holds the rest of the section. Resolving an alias to a version
 * and reading the allowlist are the host's: it passes what the allowlist permits.
 */

/** The three forms the frontmatter `model` field takes. */
export type ModelValueKind = 'alias' | 'full-id' | 'inherit';

const isAlias = (value: string): value is ModelAlias => MODEL_ALIASES.some((a) => a === value);

/**
 * Which form a `model` value is: one of the aliases `sonnet`, `opus`, `haiku`, `fable`; `inherit`; or
 * anything else, a full model ID that "accepts the same values as the `--model` flag" (so the kit
 * does not judge whether such an ID exists).
 */
export function modelValueKind(value: string): ModelValueKind {
  const text = value.trim();
  if (text === 'inherit') return 'inherit';
  return isAlias(text) ? 'alias' : 'full-id';
}

type Writer = 'frontmatter' | 'invocation';

/** Which forms each writer may use: "Claude can't pass a full model ID or `inherit` on that call". */
const ACCEPTS: { readonly [W in Writer]: readonly ModelValueKind[] } = {
  frontmatter: ['alias', 'full-id', 'inherit'],
  invocation: ['alias'],
};

/** Whether the `model` field of a definition, or the `model` parameter of an Agent call, may hold the value. */
export const modelValueAccepted = (writer: Writer, value: string): boolean =>
  ACCEPTS[writer].includes(modelValueKind(value));

/** What the organization's `availableModels` allowlist says, as the host evaluates it. */
export interface ModelAllowlist {
  /** The model may be used. */
  permits(model: string): boolean;
  /** The newest version of a family the allowlist permits (the substitution rules of `/model`), or `undefined`. */
  newestPermitted(family: ModelAlias): string | undefined;
}

export interface CheckedModel {
  readonly model: string;
  /** What was asked for, when it was replaced: the interactive warning "naming the requested model and the model the subagent runs on". */
  readonly replaced?: { readonly requested: string; readonly running: string };
}

export interface ModelCheckInput {
  /** The model the order of `resolveSubagentModel` chose (an alias or a full ID). */
  readonly chosen: string;
  /** `CLAUDE_CODE_SUBAGENT_MODEL`, tried first when the chosen value is blocked. */
  readonly envModel?: string | undefined;
  /** The inherited model: the main conversation's. */
  readonly inherited: string;
  /** Absent: no allowlist, nothing is blocked. */
  readonly allowlist?: ModelAllowlist | undefined;
}

/** A blocked family alias runs on the newest version of its family the allowlist permits. */
function familyVersion(value: string, allowlist: ModelAllowlist): string | undefined {
  const text = value.trim();
  return isAlias(text) ? allowlist.newestPermitted(text) : undefined;
}

/** The value itself when permitted, else its family's newest permitted version, else nothing. */
function permitted(value: string, allowlist: ModelAllowlist): string | undefined {
  if (allowlist.permits(value)) return value;
  return familyVersion(value, allowlist);
}

const usable = (envModel: string | undefined): string | undefined => {
  const text = envModel?.trim();
  return text === undefined || text === '' || text === 'inherit' ? undefined : text;
};

/**
 * Applies the allowlist to the model a subagent was about to run on. A blocked family alias such as
 * `opus` becomes the newest version of that family the allowlist permits; "for any other blocked
 * value ... or when the allowlist permits no version of the family" the subagent runs on the
 * inherited model, "If you set `CLAUDE_CODE_SUBAGENT_MODEL`, Claude Code tries that model first,
 * under these same rules". The inherited model is never checked: it is what the session already runs.
 */
export function checkAgainstAllowlist(input: ModelCheckInput): CheckedModel {
  const { allowlist, chosen, inherited } = input;
  if (allowlist === undefined) return { model: chosen };
  const direct = permitted(chosen, allowlist);
  const viaEnv = usable(input.envModel);
  const fallback = viaEnv === undefined ? undefined : permitted(viaEnv, allowlist);
  const running = direct ?? fallback ?? inherited;
  return running === chosen
    ? { model: chosen }
    : { model: running, replaced: { requested: chosen, running } };
}
