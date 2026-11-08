import { error, type PluginIssue } from '../../format/issues.ts';

/**
 * The runtime constraints of a workflow run (workflows.md, "Behavior and limits"). Pure decisions over
 * counts the host holds: the kit runs no workflow and keeps no run state.
 */

/** "1,000 agents total per run | Prevents runaway loops". */
export const MAX_AGENTS_PER_RUN = 1000;

/** "Up to 4,096 items in a single `parallel()` or `pipeline()` call". */
export const MAX_FAN_OUT_ITEMS = 4096;

/** The calls that take a list of work (workflows.md, "What the saved script looks like"). */
export const FAN_OUT_CALLS = ['parallel', 'pipeline'] as const;
export type FanOutCall = (typeof FAN_OUT_CALLS)[number];

export type Admission =
  | { readonly admitted: true }
  | { readonly admitted: false; readonly issue: PluginIssue };

/**
 * Whether the run may start one more agent, given how many `agent()` calls it has started. The
 * 1,000th is the last; the next call fails with an error (judgment: the docs name the cap and its
 * purpose, not the failure; a restart of an agent after a stall is the same agent and is not counted).
 */
export function admitAgent(started: number): Admission {
  if (started < MAX_AGENTS_PER_RUN) return { admitted: true };
  const message = `a workflow run starts at most ${MAX_AGENTS_PER_RUN} agents; this run has started ${started}`;
  return { admitted: false, issue: error('agent', message) };
}

/** "the runtime rejects a longer list with an error": nothing in the list runs when it is too long. */
export function checkFanOut(call: FanOutCall, items: number): PluginIssue | undefined {
  if (items <= MAX_FAN_OUT_ITEMS) return undefined;
  const message = `${call}() takes up to ${MAX_FAN_OUT_ITEMS} items; got ${items}`;
  return error(call, message);
}

/**
 * What can interrupt a run. "A run pauses on its own only for agent permission prompts and a
 * usage-limit wait": nothing else pauses it. `script-question` and `stage-sign-off` are the kit's own
 * names for the two kinds of mid-run input the docs turn away ("For sign-off between stages, run each
 * stage as its own workflow"), so a host can name why it refuses (spec/judgments.md).
 */
export const INTERRUPTIONS = [
  'agent-permission-prompt',
  'usage-limit-wait',
  'script-question',
  'stage-sign-off',
] as const;
export type Interruption = (typeof INTERRUPTIONS)[number];

const PAUSES_RUN: { readonly [I in Interruption]: boolean } = {
  'agent-permission-prompt': true,
  'usage-limit-wait': true,
  'script-question': false,
  'stage-sign-off': false,
};

const NO_MID_RUN_INPUT = error(
  'script',
  'a workflow run takes no input while it runs; for sign-off between stages, run each stage as its own workflow',
);

export type Pause =
  | { readonly pauses: true }
  | { readonly pauses: false; readonly issue: PluginIssue };

/** Whether the run waits for it, or refuses it (judgment: the docs give no wording for the refusal). */
export function interruptRun(cause: Interruption): Pause {
  return PAUSES_RUN[cause] ? { pauses: true } : { pauses: false, issue: NO_MID_RUN_INPUT };
}

/** The default and the bounds of `CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS` (env-vars.md). */
export const DEFAULT_CONCURRENCY = 16;
const MAX_CONCURRENCY = 256;

/**
 * How many agents a run executes at once: 16, "fewer when Claude Code has fewer CPUs available", or the
 * variable's value from 1 to 256. It "takes plain digits only; out-of-range values and other spellings
 * keep the default". Whether the CPU count also caps an explicit value is not said: it does not
 * (spec/judgments.md).
 */
export function workflowConcurrency(
  env: Readonly<Record<string, string | undefined>>,
  cpus: number,
): number {
  const asked = env.CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS;
  const value = asked !== undefined && /^\d+$/.test(asked) ? Number(asked) : 0;
  if (value >= 1 && value <= MAX_CONCURRENCY) return value;
  return Math.max(1, Math.min(DEFAULT_CONCURRENCY, Math.floor(cpus)));
}
