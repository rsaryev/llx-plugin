import { error, type PluginIssue } from '../../../format/issues.ts';
import { isRecord } from '../inputs/record.ts';

/** An `allowed_domains` or `blocked_domains` value that holds at least one entry. */
const isFilled = (value: unknown): boolean => Array.isArray(value) && value.length > 0;

/**
 * "Claude can scope results with `allowed_domains` to include only certain hosts, or
 * `blocked_domains` to exclude them. The two lists can't be combined in a single call."
 * (tools-reference.md, "WebSearch tool behavior"). A call with both lists filled is one error at
 * `tool_input`. An empty list is no list, a value that is not an array is left to `parseToolInput`
 * and the wording is a judgment (spec/judgments.md). How an entry matches a result's host is not in
 * the docs and is not modelled.
 */
export function validateWebSearchDomains(input: unknown): readonly PluginIssue[] {
  if (!isRecord(input)) return [];
  return isFilled(input.allowed_domains) && isFilled(input.blocked_domains)
    ? [
        error(
          'tool_input',
          'allowed_domains and blocked_domains cannot be combined in a single call',
        ),
      ]
    : [];
}
