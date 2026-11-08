import { MOD_LIMITS } from '../../protocol/mods-limits.ts';
import { isRecord } from './spec.ts';

/**
 * A hook's `drop` reason or `config.set` `deny` reason is cut at 4,096 characters, the end of a
 * longer one, and the drop or deny still applies (reference.md, "Limits"). A character is a code
 * point, so the cut never splits a surrogate pair (judgment: the docs say "characters").
 */
export function clampReason(reason: string): string {
  if (reason.length <= MOD_LIMITS.reasonChars) return reason;
  const points = Array.from(reason);
  return points.length <= MOD_LIMITS.reasonChars
    ? reason
    : points.slice(0, MOD_LIMITS.reasonChars).join('');
}

/** `result` with the string under `key` cut by `clampReason`; any other result as it is. */
export function clampReasonAt(result: unknown, key: string): unknown {
  if (!isRecord(result)) return result;
  const reason = result[key];
  return typeof reason === 'string' ? { ...result, [key]: clampReason(reason) } : result;
}
