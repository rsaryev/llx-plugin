import { warning, type PluginIssue } from '../../format/issues.ts';
import { evaluateIf, type IfResult } from '../../rules/index.ts';
import type { MatchContext } from '../../rules/types.ts';
import type { MonitorTreatment, RegisteredHandler, ToolCallView } from '../contracts.ts';

/** Evaluates one `if` rule against a tool call, with whatever context rules need (cwd, home). */
export type IfEvaluator = (rule: string, toolName: string, toolInput: unknown) => IfResult;

/** The evaluator of permission rule syntax over a match context the host (or the engine) built. */
export const ifEvaluatorFor =
  (context: MatchContext): IfEvaluator =>
  (rule, toolName, toolInput) =>
    evaluateIf(rule, toolName, toolInput, context);

export interface GuardResult {
  readonly runs: boolean;
  readonly issues: readonly PluginIssue[];
}

/** What the `if` is read against: the tool call (absent on a non-tool event), how a Monitor call got here, the rule reader. */
export interface GuardSubject {
  readonly call: ToolCallView | undefined;
  readonly monitor: MonitorTreatment | undefined;
  readonly evaluate: IfEvaluator | undefined;
}

const RUNS: GuardResult = { runs: true, issues: [] };

/**
 * hooks.md, "Common fields": `if` is "only evaluated on tool events ... On other events, a hook with
 * `if` set never runs". On a tool event the rule is read as permission rule syntax; a call the rule
 * cannot be decided for runs the hook ("it runs your hook regardless of the pattern"). A Monitor
 * call that reached the hook through a `Bash` matcher is a Bash call to `if`: "In `if`, name Bash
 * ... The hook doesn't run if its `if` names Monitor".
 */
export function guardWithIf(
  entry: RegisteredHandler,
  subject: GuardSubject,
  path: string,
): GuardResult {
  const { call, monitor, evaluate } = subject;
  const rule = entry.handler.if;
  if (rule === undefined) return RUNS;
  if (call === undefined) return { runs: false, issues: [] };
  if (evaluate === undefined) {
    return {
      runs: true,
      issues: [
        warning(
          `${path}.if`,
          'No rule evaluator was given, so the `if` filter does not apply and the hook runs for every call',
        ),
      ],
    };
  }
  const toolName = monitor?.asBash === true ? 'Bash' : call.toolName;
  const result = evaluate(rule, toolName, call.toolInput);
  return {
    runs: result.runs,
    issues: result.issues.map((issue) => ({ ...issue, path: `${path}.if` })),
  };
}
