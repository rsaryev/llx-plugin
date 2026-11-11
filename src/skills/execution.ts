import type { InvocableFrontmatter, SkillShell } from '../format/skill-types.ts';
import type { Environment } from '../ports/index.ts';
import { EFFORT_LEVELS } from '../protocol/effort.ts';
import type { EffortLevel } from '../protocol/official.ts';

/**
 * How a skill runs once it is invoked (skills.md, "Run skills in a subagent", "Frontmatter
 * reference", "How injected commands run"; model-config.md, "Restrict model selection" and "Adjust
 * effort level"). Pure over the skill and what the host knows of the session; the host reads its
 * environment through `readExecutionEnvironment`.
 */

type Runnable = Pick<
  InvocableFrontmatter,
  'agent' | 'background' | 'context' | 'effort' | 'model' | 'shell' | 'shellDeclared'
>;

/** The documented default agent: "If omitted, uses `general-purpose`". */
const DEFAULT_AGENT = 'general-purpose';

/** What fires a skill; the last two always wait for a forked skill's result. */
export type Trigger = 'user' | 'model' | 'scheduled-task' | 'workflow-agent';

export interface ExecutionContext {
  /** False with `-p` or through the Agent SDK. */
  readonly interactive: boolean;
  /** `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` is `1`. */
  readonly backgroundTasksDisabled: boolean;
  readonly trigger: Trigger;
  /** The commands of forked skills still running. */
  readonly runningForks?: ReadonlySet<string>;
}

/** In the order skills.md gives them: the field first, then the cases of the list, then the workflow note. */
const WAIT_ORDER = [
  'background-false',
  'non-interactive',
  'background-tasks-disabled',
  'already-running',
  'scheduled-task',
  'workflow-agent',
] as const;

/** Why a forked skill waits for its result instead of running in the background. */
export type WaitReason = (typeof WAIT_ORDER)[number];

type WaitCheck = (skill: Runnable & { readonly command: string }, ctx: ExecutionContext) => boolean;

/** The triggers that always wait for a forked skill's result, and why. */
const TRIGGER_WAIT: { readonly [T in Trigger]: WaitReason | undefined } = {
  user: undefined,
  model: undefined,
  'scheduled-task': 'scheduled-task',
  'workflow-agent': 'workflow-agent',
};

const byTrigger =
  (reason: WaitReason): WaitCheck =>
  (_, ctx) =>
    TRIGGER_WAIT[ctx.trigger] === reason;

const WAIT_CHECKS: { readonly [R in WaitReason]: WaitCheck } = {
  'background-false': (skill) => !skill.background,
  'non-interactive': (_, ctx) => !ctx.interactive,
  'background-tasks-disabled': (_, ctx) => ctx.backgroundTasksDisabled,
  'already-running': (skill, ctx) => ctx.runningForks?.has(skill.command) ?? false,
  'scheduled-task': byTrigger('scheduled-task'),
  'workflow-agent': byTrigger('workflow-agent'),
};

export type Execution =
  | { readonly mode: 'inline' }
  | {
      readonly mode: 'fork';
      /** The subagent type that runs the skill. */
      readonly agent: string;
      /** The subagent runs while the user keeps working; its result arrives when it completes. */
      readonly background: boolean;
      readonly waitsFor: readonly WaitReason[];
      /** "A backgrounded fork also runs with the narrower tool set": waiting keeps the full one. */
      readonly fullToolSet: boolean;
      /** The subagent "doesn't see your conversation history". */
      readonly seesConversation: false;
    };

/** Inline, or a forked subagent and whether the caller waits for it. */
export function resolveExecution(
  skill: Runnable & { readonly command: string },
  ctx: ExecutionContext,
): Execution {
  if (skill.context === undefined) return { mode: 'inline' };
  const waitsFor = WAIT_ORDER.filter((reason) => WAIT_CHECKS[reason](skill, ctx));
  const background = waitsFor.length === 0;
  return {
    mode: 'fork',
    agent: skill.agent ?? DEFAULT_AGENT,
    background,
    waitsFor,
    fullToolSet: !background,
    seesConversation: false,
  };
}

/** The two variables a skill's execution reads (env-vars.md). */
export interface ExecutionEnvironment {
  readonly backgroundTasksDisabled: boolean;
  /** `CLAUDE_CODE_EFFORT_LEVEL`: a level, or `none` for `auto`/`unset` (no level is sent). */
  readonly effort?: EffortLevel | 'none';
}

const effortLevelOf = (value: string): EffortLevel | undefined =>
  EFFORT_LEVELS.find((level) => level === value);

/** `auto` and `unset` "do the same thing": Claude Code sends no effort level (model-config.md). */
const NO_LEVEL = ['auto', 'unset'];

export function readExecutionEnvironment(environment: Environment): ExecutionEnvironment {
  const value = environment.get('CLAUDE_CODE_EFFORT_LEVEL');
  const effort = value === undefined ? undefined : readEffortValue(value);
  return {
    backgroundTasksDisabled: environment.get('CLAUDE_CODE_DISABLE_BACKGROUND_TASKS') === '1',
    ...(effort === undefined ? {} : { effort }),
  };
}

/** Judgment (spec/judgments.md): a value that is neither a level nor `auto`/`unset` is ignored. */
function readEffortValue(value: string): EffortLevel | 'none' | undefined {
  if (NO_LEVEL.includes(value)) return 'none';
  return effortLevelOf(value);
}

/** What the host knows about which models may run (`availableModels`, the permission mode). */
export interface ModelAvailability {
  /** The organization's `availableModels` allowlist permits the model. */
  readonly allowed: (model: string) => boolean;
  /** Auto mode (and plan mode while the classifier reviews commands) supports the model. Absent: supported. */
  readonly supportedInMode?: (model: string) => boolean;
  /** For a forked skill: the newest permitted version of a blocked family alias. Absent: none. */
  readonly substitute?: (model: string) => string | undefined;
}

export interface TurnSession {
  readonly models?: ModelAvailability;
  /** `CLAUDE_CODE_EFFORT_LEVEL`, from `readExecutionEnvironment`. */
  readonly effortEnvironment?: EffortLevel | 'none' | undefined;
  /** `maxEffortLevel` or an organization cap: "still limits the level the skill ... runs at". */
  readonly maxEffort?: EffortLevel;
  /**
   * The levels the active model supports; an unsupported level "falls back to the highest supported
   * level at or below" (`xhigh` runs as `high`). Absent: all. Judgment: none at or below sends no level.
   */
  readonly supportedEfforts?: readonly EffortLevel[];
}

export type ModelKept = 'excluded' | 'unsupported-in-mode';

export interface EffortChoice {
  /** Absent when the environment says to send no level, or the model supports none at or below it. */
  readonly level?: EffortLevel;
  readonly source: 'skill' | 'environment';
}

export interface TurnOverrides {
  /** The rest of the turn, or the forked subagent. */
  readonly target: 'turn' | 'subagent';
  /** The model to run on; absent keeps the session's (or, for a fork, the inherited) model. */
  readonly model?: string;
  /** Why the skill's `model` was not used. */
  readonly modelKept?: ModelKept;
  /** A forked skill's blocked family alias was replaced by a permitted version. */
  readonly modelSubstituted?: true;
  readonly effort?: EffortChoice;
}

type ModelOutcome = Pick<TurnOverrides, 'model' | 'modelKept' | 'modelSubstituted'>;
type ModelRule = (model: string, models: ModelAvailability) => ModelOutcome;

/**
 * "Skill or command override: Claude Code ignores the override ... and the skill or command runs on
 * the session model"; a skill "that runs in a subagent follows the subagent behavior instead": a
 * substitute, else the inherited model. Judgment: the auto-mode rule is stated for the turn's
 * override, so a fork is checked against the allowlist only.
 */
const MODEL_RULES: { readonly [T in NonNullable<TurnOverrides['target']>]: ModelRule } = {
  turn: (model, models) => {
    if (!models.allowed(model)) return { modelKept: 'excluded' };
    if (models.supportedInMode?.(model) === false) return { modelKept: 'unsupported-in-mode' };
    return { model };
  },
  subagent: (model, models) => {
    if (models.allowed(model)) return { model };
    const substitute = models.substitute?.(model);
    return substitute === undefined
      ? { modelKept: 'excluded' }
      : { model: substitute, modelSubstituted: true };
  },
};

const ANY_MODEL: ModelAvailability = { allowed: () => true };

const capped = (level: EffortLevel, max: EffortLevel | undefined): EffortLevel =>
  max !== undefined && EFFORT_LEVELS.indexOf(level) > EFFORT_LEVELS.indexOf(max) ? max : level;

/** The highest level the model supports at or below `level`, or `undefined` when there is none. */
function supported(
  level: EffortLevel,
  levels: readonly EffortLevel[] | undefined,
): EffortLevel | undefined {
  if (levels === undefined) return level;
  return EFFORT_LEVELS.slice(0, EFFORT_LEVELS.indexOf(level) + 1)
    .toReversed()
    .find((candidate) => levels.includes(candidate));
}

/** The cap lowers the level, then the model's support lowers it again. */
function settle(
  level: EffortLevel,
  source: EffortChoice['source'],
  session: TurnSession,
): EffortChoice {
  const settled = supported(capped(level, session.maxEffort), session.supportedEfforts);
  return settled === undefined ? { source } : { level: settled, source };
}

/** The environment variable wins over the skill; the cap and the model's support lower either. */
function chooseEffort(skillLevel: EffortLevel, session: TurnSession): EffortChoice {
  const fromEnvironment = session.effortEnvironment;
  if (fromEnvironment === 'none') return { source: 'environment' };
  if (fromEnvironment !== undefined) return settle(fromEnvironment, 'environment', session);
  return settle(skillLevel, 'skill', session);
}

/** The skill's own `model`: `inherit` and no value both keep the model the session would use. */
const requestedModel = (skill: Runnable): string | undefined =>
  skill.model === 'inherit' ? undefined : skill.model;

/**
 * The model and effort a skill sets for the rest of the turn, or for its forked subagent. Absent
 * fields override nothing: the session's own resolution order applies.
 */
export function resolveTurnOverrides(skill: Runnable, session: TurnSession): TurnOverrides {
  const target = skill.context === undefined ? 'turn' : 'subagent';
  const requested = requestedModel(skill);
  const model =
    requested === undefined ? {} : MODEL_RULES[target](requested, session.models ?? ANY_MODEL);
  const effort = skill.effort === undefined ? {} : { effort: chooseEffort(skill.effort, session) };
  return { target, ...model, ...effort };
}

export interface ShellAvailability {
  /** Bash is available (not Windows without Git Bash). */
  readonly bash: boolean;
  /** The PowerShell tool is enabled. */
  readonly powershell: boolean;
}

export type ShellResolution =
  | { readonly ok: true; readonly tool: SkillShell }
  | { readonly ok: false; readonly message: string };

type ShellRule = (
  skill: Pick<Runnable, 'shell' | 'shellDeclared'> & { readonly name: string },
  tools: ShellAvailability,
) => ShellResolution | undefined;

/** The rules of "How injected commands run", in the order the page gives them. */
const SHELL_RULES: readonly ShellRule[] = [
  (skill, tools) =>
    skill.shell === 'powershell' && tools.powershell ? { ok: true, tool: 'powershell' } : undefined,
  (skill, tools) =>
    skill.shellDeclared === true && skill.shell === 'bash' && !tools.bash
      ? {
          ok: false,
          message: `Skill ${skill.name} requires bash (\`shell: bash\` in frontmatter) but Git Bash was not found`,
        }
      : undefined,
  (_, tools) => (tools.bash ? { ok: true, tool: 'bash' } : undefined),
  (_, tools) => (tools.powershell ? { ok: true, tool: 'powershell' } : undefined),
];

/**
 * Which tool runs a skill's `` !`command` `` blocks, or the one failure that stops the invocation.
 * Judgment (spec/judgments.md): with neither tool the docs name no message; the invocation fails
 * naming the skill.
 */
export function resolveShell(
  skill: Pick<Runnable, 'shell' | 'shellDeclared'> & { readonly name: string },
  tools: ShellAvailability,
): ShellResolution {
  for (const rule of SHELL_RULES) {
    const resolved = rule(skill, tools);
    if (resolved !== undefined) return resolved;
  }
  return {
    ok: false,
    message: `Skill ${skill.name} cannot run its shell commands: neither Bash nor the PowerShell tool is available`,
  };
}
