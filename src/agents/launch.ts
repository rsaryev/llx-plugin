import { AUTO_COMPACT_RANGE } from '../format/agent-scalars.ts';
import type { CacheTtl } from '../format/agent-scalars.ts';

/**
 * Small pure decisions a host takes when it starts a subagent, one per frontmatter field that
 * changes how the run is set up (sub-agents.md, "Frontmatter reference", "Run subagents in
 * foreground or background", "What loads at startup", "Set the auto-compact window for one
 * subagent"). The kit decides; compacting, running the turn loop, creating a worktree and loading
 * files are the host's. The model and effort decisions are in `launch-model.ts`.
 */

const { min: WINDOW_MIN, max: WINDOW_MAX } = AUTO_COMPACT_RANGE;

export interface AutoCompactInput {
  /** The definition's `autoCompactWindow` (already read; a dropped field is undefined). */
  readonly field?: number | undefined;
  /** The window the subagent would otherwise inherit. */
  readonly inherited: number;
  /** `CLAUDE_CODE_AUTO_COMPACT_WINDOW` as a number. */
  readonly env?: number | undefined;
  /** The agent runs the whole session (`--agent`, the `agent` setting). */
  readonly asMainSession: boolean;
}

const clamp = (tokens: number): number => Math.min(Math.max(tokens, WINDOW_MIN), WINDOW_MAX);

/** model-config.md: a value below the minimum or above the maximum is treated as the limit. */
const usableEnv = (env: number | undefined): number | undefined =>
  env !== undefined && Number.isFinite(env) && env > 0 ? clamp(env) : undefined;

const inRange = (tokens: number): boolean =>
  Number.isSafeInteger(tokens) && tokens >= WINDOW_MIN && tokens <= WINDOW_MAX;

/**
 * The auto-compact window a subagent compacts at. The variable wins ("the subagent uses that
 * variable's window instead and the field has no effect, unless Claude Code ignores the variable's
 * value"); the field only lowers ("To compact earlier, set a value below that window") and "has no
 * effect" for a session run as the agent.
 */
export function effectiveAutoCompactWindow(input: AutoCompactInput): number {
  const env = usableEnv(input.env);
  if (env !== undefined) return env;
  const { field, inherited } = input;
  if (input.asMainSession || field === undefined || !inRange(field)) return inherited;
  return Math.min(field, inherited);
}

export interface TurnLimitOutcome {
  readonly stop: boolean;
  /** "Claude Code returns its output marked as partial" and Claude can resume it. */
  readonly partial: boolean;
}

/**
 * Whether the subagent has reached `maxTurns`: "Maximum number of agentic turns before the
 * subagent stops". No limit unless it is a positive whole number (judgment, spec/judgments.md).
 */
export function turnLimitOutcome(
  maxTurns: number | undefined,
  turnsTaken: number,
): TurnLimitOutcome {
  const reached =
    maxTurns !== undefined && Number.isInteger(maxTurns) && maxTurns >= 1 && turnsTaken >= maxTurns;
  return { stop: reached, partial: reached };
}

const LONG_TTL: CacheTtl = '1h';

/**
 * The `cacheTtl` the frontmatter contributes to a subagent's requests: it "ignores `1h` while your
 * Claude subscription is using usage credits" (prompt-caching.md, "Choose the TTL yourself"). The
 * result is the frontmatter's step of the precedence; `undefined` leaves the decision to the next one.
 */
export function effectiveCacheTtl(input: {
  readonly cacheTtl?: CacheTtl | undefined;
  readonly usingUsageCredits: boolean;
}): CacheTtl | undefined {
  const { cacheTtl, usingUsageCredits } = input;
  return usingUsageCredits && cacheTtl === LONG_TTL ? undefined : cacheTtl;
}

export interface BackgroundInput {
  /** The definition's `background`. */
  readonly background?: boolean | undefined;
  /** Claude asked to wait for the result (on its judgment or yours in `claude -p` and the SDK; fork mode off). */
  readonly claudeWillWait: boolean;
  /** `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`: "Claude waits for subagents to finish". */
  readonly backgroundDisabled?: boolean | undefined;
}

/**
 * Whether a subagent runs in the background. "With nothing configured, a subagent that Claude
 * spawns from your main conversation starts in the background"; `background: true` keeps it there
 * "even when Claude asks to wait for it".
 */
export function runsInBackground(input: BackgroundInput): boolean {
  if (input.backgroundDisabled === true) return false;
  return input.background === true || !input.claudeWillWait;
}

export interface ClaudeMdScopes {
  readonly user: boolean;
  readonly project: boolean;
  readonly local: boolean;
  readonly managedPolicy: boolean;
}

const ALL_CLAUDE_MD: ClaudeMdScopes = {
  user: true,
  project: true,
  local: true,
  managedPolicy: true,
};

/**
 * The CLAUDE.md files a subagent starts with. `omitClaudeMd` drops the user, project and local
 * files; "managed policy files still load, except for managed subagents"; it is "Ignored when the
 * agent runs as the main session agent".
 */
export function claudeMdScopes(input: {
  readonly omitClaudeMd?: boolean | undefined;
  readonly asMainSession: boolean;
  readonly managedSubagent: boolean;
}): ClaudeMdScopes {
  if (input.omitClaudeMd !== true || input.asMainSession) return ALL_CLAUDE_MD;
  return { user: false, project: false, local: false, managedPolicy: !input.managedSubagent };
}

/**
 * What happens to a subagent's worktree when it finishes: "automatically cleaned up if the
 * subagent makes no changes" (sub-agents.md, `isolation`), and one with changes "stays on disk"
 * (worktrees.md, "Isolate subagents with worktrees").
 */
export function worktreeDisposition(hasChanges: boolean): 'keep' | 'cleanup' {
  return hasChanges ? 'keep' : 'cleanup';
}

/** Judgment: the docs say "Prepended to any user-provided prompt" and no separator; a blank line. */
const PROMPT_SEPARATOR = '\n\n';

/**
 * The first user turn to submit for an agent run as the main session agent: its `initialPrompt`,
 * "Prepended to any user-provided prompt". A subagent run submits nothing (undefined). Processing
 * commands and skills in the text is the host's.
 */
export function mainSessionFirstTurn(input: {
  readonly initialPrompt?: string | undefined;
  readonly asMainSession: boolean;
  readonly userPrompt?: string | undefined;
}): string | undefined {
  const initial = input.initialPrompt?.trim();
  if (!input.asMainSession || initial === undefined || initial === '') return undefined;
  const user = input.userPrompt?.trim();
  return user === undefined || user === '' ? initial : `${initial}${PROMPT_SEPARATOR}${user}`;
}
