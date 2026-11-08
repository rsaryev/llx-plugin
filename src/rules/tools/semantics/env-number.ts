import type { Environment } from '../../../ports/environment.ts';

/**
 * The value of a variable that is a positive integer; any other text counts as unset
 * (spec/judgments.md: the docs name no behaviour for a variable that is not a number).
 */
export function positiveInteger(env: Pick<Environment, 'get'>, name: string): number | undefined {
  const text = env.get(name)?.trim();
  if (text === undefined || !/^\d+$/.test(text)) return undefined;
  const value = Number(text);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
