import type { Environment } from '../../ports/index.ts';
import type { HookHandler, HookHandlerType } from '../../protocol/hook-config.ts';
import type { HookEvent } from '../../protocol/official.ts';
import type { HookSourceKind, RegisteredHandler } from '../contracts.ts';

/**
 * How long a handler may run (hooks.md, "Common fields", `timeout`): the kit computes the limit
 * and hands it to the port, which enforces it and reports `timedOut`.
 */

/** "Defaults: 600 for `command`, `http`, and `mcp_tool`; 30 for `prompt`; 60 for `agent`". */
const DEFAULT_SECONDS: { readonly [T in HookHandlerType]: number } = {
  command: 600,
  http: 600,
  mcp_tool: 600,
  prompt: 30,
  agent: 60,
};

/** The types whose default an event lowers: "the `command`, `http`, and `mcp_tool` default". */
const LOWERED_TYPES: ReadonlySet<HookHandlerType> = new Set(['command', 'http', 'mcp_tool']);

/**
 * "Claude Code kills a command hook that is still running" when the 10 seconds after `Ctrl+Enter`
 * are up (hooks.md, "PostToolUse after an interrupt"): only a command hook. Judgment
 * (spec/judgments.md): the other types keep their own `timeout`.
 */
const INTERRUPT_KILLS: { readonly [T in HookHandlerType]: boolean } = {
  command: true,
  http: false,
  mcp_tool: false,
  prompt: false,
  agent: false,
};

/** "30 on UserPromptSubmit, PreModelSwitch, and PostModelSwitch, and to 10 on MessageDisplay". */
const EVENT_DEFAULT_SECONDS: { readonly [E in HookEvent]?: number } = {
  UserPromptSubmit: 30,
  PreModelSwitch: 30,
  PostModelSwitch: 30,
  MessageDisplay: 10,
};

/** "your settings files" raise it; "plugin-provided hooks" do not (the rest: judgment, see below). */
const RAISES_BUDGET: { readonly [K in HookSourceKind]: boolean } = {
  settings: true,
  plugin: false,
  skill: false,
  agent: false,
  session: false,
};

const SESSION_END_DEFAULT_MS = 1500;
const SESSION_END_MAX_BUDGET_MS = 60_000;
/** "Set this environment variable in milliseconds to override the budget explicitly". */
const SESSION_END_OVERRIDE = 'CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS';

/** The limits `SessionEnd` hooks share: one budget for the event, and the default of each hook. */
export interface SessionEndLimits {
  readonly budgetMs: number;
  readonly defaultMs: number;
}

/** What an event adds to the timeouts of its handlers; computed once per dispatch. */
export interface TimeoutPlan {
  readonly sessionEnd?: SessionEndLimits;
  /** An interrupt caps every hook that has a limit (hooks.md, "PostToolUse after an interrupt"). */
  readonly interruptCapMs?: number;
}

const seconds = (value: number | undefined): number | undefined =>
  value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;

const toMs = (value: number): number => Math.round(value * 1000);

/** A positive whole number of milliseconds, or `undefined` for text that is not one. */
function overrideMs(environment: Environment): number | undefined {
  const text = environment.get(SESSION_END_OVERRIDE);
  if (text === undefined || !/^\d+$/.test(text.trim())) return undefined;
  const value = Number(text);
  return value > 0 ? value : undefined;
}

/**
 * "SessionEnd hooks share a 1.5-second budget; if your settings set a longer per-hook `timeout`,
 * Claude Code raises the budget to match, up to 60 seconds." "Timeouts set on plugin-provided hooks
 * don't raise the budget." The environment variable sets the budget and the default of a hook
 * with no `timeout` of its own; a hook that has one keeps it.
 *
 * Judgment (spec/judgments.md): only settings-file hooks raise the budget (the docs say "your
 * settings files"); a hook never runs longer than the budget, since the budget is shared.
 */
function sessionEndLimits(
  selected: readonly RegisteredHandler[],
  environment: Environment,
): SessionEndLimits {
  const override = overrideMs(environment);
  if (override !== undefined) return { budgetMs: override, defaultMs: override };
  const longest = Math.max(
    0,
    ...selected
      .filter(({ source }) => RAISES_BUDGET[source.kind])
      .map(({ handler }) => toMs(seconds(handler.timeout) ?? 0)),
  );
  const budgetMs = Math.min(Math.max(SESSION_END_DEFAULT_MS, longest), SESSION_END_MAX_BUDGET_MS);
  return { budgetMs, defaultMs: SESSION_END_DEFAULT_MS };
}

const EVENT_PLANS: {
  readonly [E in HookEvent]?: (
    selected: readonly RegisteredHandler[],
    environment: Environment,
  ) => TimeoutPlan;
} = {
  SessionEnd: (selected, environment) => ({ sessionEnd: sessionEndLimits(selected, environment) }),
};

/** The plan of one dispatch: `selected` are the handlers of `event` that will run. */
export const planTimeouts = (
  event: HookEvent,
  selected: readonly RegisteredHandler[],
  environment: Environment,
  interruptCapMs?: number,
): TimeoutPlan => ({
  ...EVENT_PLANS[event]?.(selected, environment),
  ...(interruptCapMs === undefined ? {} : { interruptCapMs }),
});

/**
 * "Claude Code doesn't enforce it on a command hook you run with `async: true`", but "still
 * enforces `timeout` on a hook you run with `asyncRewake`".
 */
const unbounded = (handler: HookHandler): boolean =>
  'async' in handler &&
  (handler.async ?? false) &&
  !('asyncRewake' in handler && (handler.asyncRewake ?? false));

function defaultMs(entry: RegisteredHandler, plan: TimeoutPlan): number {
  if (plan.sessionEnd !== undefined) return plan.sessionEnd.defaultMs;
  const lowered = LOWERED_TYPES.has(entry.handler.type)
    ? EVENT_DEFAULT_SECONDS[entry.event]
    : undefined;
  return toMs(lowered ?? DEFAULT_SECONDS[entry.handler.type]);
}

/**
 * The limit in milliseconds the port enforces on this handler, or `undefined` for none (an `async`
 * command hook). Judgment: a `timeout` that is not a positive number counts as unset.
 */
export function handlerTimeoutMs(entry: RegisteredHandler, plan: TimeoutPlan): number | undefined {
  if (unbounded(entry.handler)) return undefined;
  const own = seconds(entry.handler.timeout);
  const limit = own === undefined ? defaultMs(entry, plan) : toMs(own);
  const budget = plan.sessionEnd === undefined ? limit : Math.min(limit, plan.sessionEnd.budgetMs);
  // "kills a command hook that is still running, whatever its `timeout`": the other types keep theirs.
  return plan.interruptCapMs === undefined || !INTERRUPT_KILLS[entry.handler.type]
    ? budget
    : Math.min(budget, plan.interruptCapMs);
}
