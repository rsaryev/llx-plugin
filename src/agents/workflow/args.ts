import { error, type PluginIssue } from '../../format/issues.ts';
import { toJsonValue, type JsonValue } from '../../foundation/index.ts';

/**
 * Input to a saved workflow (workflows.md, "Pass input to a saved workflow"): "A saved workflow can
 * accept input through the `args` parameter. The script reads it as a global named `args`", passed
 * "as structured data, so the script can call array and object methods on `args` directly without
 * parsing it first. If `args` is omitted, the global is `undefined` inside the script."
 */
export interface WorkflowArgs {
  /** The value of the `args` global; `undefined` when none was passed. */
  readonly args: JsonValue | undefined;
  readonly issues: readonly PluginIssue[];
}

/**
 * The `args` global for a call. Data stays data: a list is a list and a string is a string, nothing is
 * parsed. A value JSON cannot hold (a function, a cycle, a bigint) cannot cross into the isolated
 * runtime, so it is refused (judgment: the docs say structured data, not what is refused).
 */
export function workflowArgs(passed: unknown): WorkflowArgs {
  if (passed === undefined) return { args: undefined, issues: [] };
  const args = toJsonValue(passed);
  if (args !== undefined) return { args, issues: [] };
  return {
    args: undefined,
    issues: [error('args', 'args must be structured data: JSON values only')],
  };
}
