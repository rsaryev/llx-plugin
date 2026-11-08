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

/** A `)` followed by `&&` or `||` and another rule: the shape of two rules joined by an operator. */
const JOINED_RULES = /\)\s*(?:&&|\|\|)\s*[A-Za-z_*]/;

/**
 * hooks.md, "Common fields": "The `if` field holds exactly one permission rule. There is no `&&`,
 * `||`, or list syntax for combining rules". Parentheses inside a rule's content are literal, so
 * `Bash(rm *) && Bash(git *)` reads as one `Bash` rule that matches almost nothing. Judgment
 * (spec/judgments.md): the rule is still read as one, and a warning says why it never fires.
 */
const joinedRulesIssues = (rule: string, path: string): readonly PluginIssue[] =>
  JOINED_RULES.test(rule)
    ? [
        warning(
          `${path}.if`,
          'The `if` field holds exactly one permission rule; `&&` and `||` do not combine rules, so this text is read as a single rule. Use a separate hook handler for each rule',
        ),
      ]
    : [];

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
    issues: [
      ...joinedRulesIssues(rule, path),
      ...result.issues.map((issue) => ({ ...issue, path: `${path}.if` })),
    ],
  };
}
