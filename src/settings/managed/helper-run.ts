import type { CommandResult } from '../../ports/command-runner.ts';
import type { Settings } from '../../protocol/official.ts';
import type { HelperHost } from './ports.ts';
import {
  helperPathFault,
  readHelperOutput,
  type PathFlavor,
  type PolicyHelper,
} from './policy-helper.ts';

/**
 * One run of a policy helper and what it comes to (settings-reference.md, `policyHelper`, "Write
 * the helper output", "Helper failures"). The process is the shared `CommandRunner`; the file check
 * is this module's `HelperFileProbe`; time is the `Clock`.
 */
export const HELPER_PHASES = ['startup', 'fetchRemoved', 'refresh'] as const;
export type HelperPhase = (typeof HELPER_PHASES)[number];

/** What a failed run costs in each phase. */
export interface PhaseOutcome {
  /**
   * "When the startup run fails, Claude Code prints the reason and refuses to start"; a run that
   * starts when "a later settings fetch reports the server-managed settings removed" "ends the
   * session with the same message as a failed startup run".
   */
  readonly stopsClaudeCode: boolean;
  /** "When a background refresh fails, Claude Code keeps the last successful policy in effect." */
  readonly keepsLastPolicy: boolean;
  /** "`/status` shows the failing refresh with its reason until a refresh succeeds." */
  readonly shownInStatus: boolean;
}

export const PHASE_OUTCOMES: { readonly [P in HelperPhase]: PhaseOutcome } = {
  startup: { stopsClaudeCode: true, keepsLastPolicy: false, shownInStatus: false },
  fetchRemoved: { stopsClaudeCode: true, keepsLastPolicy: false, shownInStatus: false },
  refresh: { stopsClaudeCode: false, keepsLastPolicy: true, shownInStatus: true },
};

export type HelperRun =
  | {
      readonly ok: true;
      /** The emitted `managedSettings`; `undefined` when the envelope omits it (the helper contributes nothing). */
      readonly settings: Settings | undefined;
      /** What the helper wrote to stderr: "With `--debug`, Claude Code writes the helper's stderr from every run to the debug log." */
      readonly stderr: string;
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly outcome: PhaseOutcome;
      readonly stderr: string;
    };

const failure = (phase: HelperPhase, detail: string, stderr = ''): HelperRun => ({
  ok: false,
  reason: `policyHelper failed: ${detail}`,
  outcome: PHASE_OUTCOMES[phase],
  stderr,
});

/** What stderr said, else stdout: "the reason includes the helper's stderr, or its stdout when stderr is empty". */
const outputOf = (result: CommandResult): string =>
  result.stderr.trim() === '' ? result.stdout.trim() : result.stderr.trim();

/** The reason a finished process failed, or `undefined` when it exited `0` in time. */
function processFault(result: CommandResult, helper: PolicyHelper): string | undefined {
  if (result.startError !== undefined) return `the helper did not start (${result.startError})`;
  // "After a timeout, the reason names the `timeoutMs` limit and includes none of the helper's output."
  if (result.timedOut)
    return `the helper was still running after timeoutMs (${helper.timeoutMs} ms)`;
  if (result.exitCode === 0) return undefined;
  return `the helper exited with code ${result.exitCode ?? 'none'}: ${outputOf(result)}`;
}

export interface HelperRunInput {
  readonly helper: PolicyHelper;
  readonly host: HelperHost;
  readonly flavor: PathFlavor;
  readonly phase: HelperPhase;
  readonly signal: AbortSignal;
}

/**
 * Runs the helper with no arguments and `CLAUDE_CODE_VERSION` set, within `timeoutMs` counted from
 * the file check (the check and the run share one budget).
 */
export async function runPolicyHelper(input: HelperRunInput): Promise<HelperRun> {
  const { helper, host, phase, signal } = input;
  const pathFault = helperPathFault(helper.path, input.flavor);
  if (pathFault !== undefined) return failure(phase, `the path ${pathFault}`);
  const started = host.clock.now();
  const probed = await host.probe.check(helper.path, helper.timeoutMs, signal);
  if (probed.timedOut)
    return failure(
      phase,
      `checking the helper file took longer than timeoutMs (${helper.timeoutMs} ms)`,
    );
  if (!probed.regularFile) return failure(phase, `no regular file is at ${helper.path}`);
  const remaining = helper.timeoutMs - (host.clock.now() - started);
  if (remaining <= 0)
    return failure(phase, `the file check used up timeoutMs (${helper.timeoutMs} ms)`);
  const result = await host.runner.run({
    spec: { form: 'exec', command: helper.path, args: [] },
    cwd: host.cwd,
    env: { ...host.env, CLAUDE_CODE_VERSION: host.version },
    timeoutMs: remaining,
    signal,
  });
  const fault = processFault(result, helper);
  if (fault !== undefined) return failure(phase, fault, result.stderr);
  const output = readHelperOutput(result.stdout, result.stderr);
  return 'failure' in output
    ? failure(phase, output.failure, result.stderr)
    : { ok: true, settings: output.settings, stderr: result.stderr };
}
