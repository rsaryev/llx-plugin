/**
 * Which agents run again when a workflow run is relaunched (workflows.md, "Resume after a pause",
 * "Which agents run again"): "Claude Code replays the run in the order agents start, and each agent
 * either returns its saved result or runs again". Pure over the saved record of the earlier run and the
 * calls the script starts now, one at a time, because a rerun agent may return something else and
 * change the prompts after it. A call is its prompt and its options: the SDK's `resumeFromRunId` says
 * "Completed agent() calls with unchanged (prompt, opts) return their cached results".
 */

export const SAVED_STATUSES = ['completed', 'failed', 'running'] as const;
export type SavedStatus = (typeof SAVED_STATUSES)[number];

/** One agent of the earlier run, in the order it started. */
export interface SavedAgent {
  readonly prompt: string;
  /**
   * A fingerprint of the call's other options (`schema`, `label`, `model` and the rest of `opts`),
   * which the host computes the same way for the saved record and for a call it starts now; absent
   * when the host keeps none, then only the prompt is compared (judgment).
   */
  readonly options?: string;
  readonly status: SavedStatus;
  /** Its result, for a completed agent. */
  readonly result?: unknown;
}

/** An `agent()` call the script starts now: its prompt and the fingerprint of its options. */
export interface AgentCall {
  readonly prompt: string;
  readonly options?: string;
}

/** Why an agent runs again. */
export const RERUN_CAUSES = [
  'prompt-differs',
  'options-differ',
  'after-change',
  'failed',
  'after-failed',
  'was-running',
  'not-saved',
] as const;
export type RerunCause = (typeof RERUN_CAUSES)[number];

export type Replay =
  | { readonly saved: true; readonly result: unknown }
  | { readonly saved: false; readonly cause: RerunCause };

/** Where the replay is: the next saved agent, and whether everything from here runs again, and why. */
export interface ReplayState {
  readonly next: number;
  readonly cascade: 'after-change' | 'after-failed' | undefined;
}

export const REPLAY_START: ReplayState = { next: 0, cascade: undefined };

interface Step {
  readonly replay: Replay;
  readonly cascade?: ReplayState['cascade'];
}

const rerun = (cause: RerunCause, cascade?: ReplayState['cascade']): Step => ({
  replay: { saved: false, cause },
  ...(cascade === undefined ? {} : { cascade }),
});

/**
 * One rule per status of the saved agent:
 * - completed: its saved result when the prompt and the options are the same; the first one whose
 *   prompt differs "runs again, and so does every agent after it, even ones that completed" (judgment:
 *   changed options count the same, as the SDK's `(prompt, opts)` says);
 * - failed: runs again, and so does every agent after it;
 * - still running when you stopped: "starts over". Stopping the whole run does not count it as failed,
 *   so the agents after it are not dragged along unless its prompt changed (judgment: the docs say the
 *   rule for a changed prompt only of completed agents; it is applied here too).
 */
const RULES: {
  readonly [S in SavedStatus]: (record: SavedAgent, call: AgentCall) => Step;
} = {
  completed: (record, call) => {
    if (record.prompt !== call.prompt) return rerun('prompt-differs', 'after-change');
    if (record.options !== call.options) return rerun('options-differ', 'after-change');
    return { replay: { saved: true, result: record.result } };
  },
  failed: () => rerun('failed', 'after-failed'),
  running: (record, call) =>
    rerun(
      'was-running',
      record.prompt === call.prompt && record.options === call.options ? undefined : 'after-change',
    ),
};

/** What the agent the script starts now does: returns its saved result or runs again. */
export function replayAgent(
  saved: readonly SavedAgent[],
  state: ReplayState,
  call: AgentCall,
): { readonly replay: Replay; readonly state: ReplayState } {
  const next = state.next + 1;
  const record = saved[state.next];
  if (state.cascade !== undefined) {
    return {
      replay: { saved: false, cause: state.cascade },
      state: { next, cascade: state.cascade },
    };
  }
  if (record === undefined) {
    return { replay: { saved: false, cause: 'not-saved' }, state: { next, cascade: undefined } };
  }
  const step = RULES[record.status](record, call);
  return { replay: step.replay, state: { next, cascade: step.cascade } };
}

/**
 * The decisions for a script that starts `calls` in this order, when no rerun agent returns anything
 * different from before (what a relaunch of an unchanged or edited-prompt script shows).
 */
export function planReplay(saved: readonly SavedAgent[], calls: readonly AgentCall[]): Replay[] {
  let state = REPLAY_START;
  return calls.map((call) => {
    const step = replayAgent(saved, state, call);
    state = step.state;
    return step.replay;
  });
}

export const STOP_SCOPES = ['whole-run', 'one-agent'] as const;
export type StopScope = (typeof STOP_SCOPES)[number];

/**
 * How the saved record keeps an agent that had not finished when it was stopped: "Stopping the whole
 * run doesn't count any agent as failed"; "Stopping one agent alone, by selecting it in `/workflows`
 * and pressing `x`, counts as failing."
 */
export const RECORDED_WHEN_STOPPED: { readonly [S in StopScope]: SavedStatus } = {
  'whole-run': 'running',
  'one-agent': 'failed',
};
