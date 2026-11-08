import type { HookEvent } from '../../protocol/official.ts';
import type { ParseOutput } from '../verdict/types.ts';
import { hasText } from './fields.ts';
import { outputSchema, type CheckedOutput } from './schemas.ts';

/**
 * Reading one JSON value as the output of a hook (hooks.md, "JSON output", "Exit code 0"): "JSON
 * that can't be parsed or fails schema validation" is a non-blocking error, and the message names
 * what is wrong so the author can fix it. An unknown key is dropped; a value of the wrong type fails.
 */

export interface CheckedResult {
  readonly data?: CheckedOutput;
  readonly failure?: string;
}

/** Events whose `block` needs its explanation: "`reason` | Required when `decision` is `\"block\"`". */
const REASON_REQUIRED: ReadonlySet<HookEvent> = new Set<HookEvent>(['Stop', 'SubagentStop']);

const pathOf = (segments: readonly PropertyKey[]): string =>
  segments.reduce<string>(
    (path, segment) =>
      typeof segment === 'number'
        ? `${path}[${segment}]`
        : path === ''
          ? String(segment)
          : `${path}.${String(segment)}`,
    '',
  );

const missingReason = (event: HookEvent, data: CheckedOutput): boolean =>
  REASON_REQUIRED.has(event) && data.decision === BLOCK && !hasText(data.reason);

const BLOCK = 'block';

export function checkOutput(event: HookEvent, json: unknown): CheckedResult {
  const parsed = outputSchema(event).safeParse(json);
  if (!parsed.success) {
    const found = parsed.error.issues.map((issue) => {
      const where = pathOf(issue.path);
      return where === '' ? issue.message : `${where}: ${issue.message}`;
    });
    return { failure: found.join('; ') };
  }
  if (missingReason(event, parsed.data)) {
    return { failure: `reason: Required when decision is "${BLOCK}" on ${event}` };
  }
  return { data: parsed.data };
}

/** The output stage's `parse`: the checked output, or why it failed. */
export const parseHookOutput: ParseOutput = (event, json) => {
  const checked = checkOutput(event, json);
  return checked.data === undefined
    ? { failure: checked.failure ?? 'the output is not valid' }
    : { output: checked.data };
};
