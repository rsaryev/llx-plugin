import type { z } from 'zod';
import { errorAt, type Finding } from './finding.ts';

/** The dotted path of a zod issue below `base`, as the oracle prints it (`userConfig.key.title`, `skills.0`). */
export const dotted = (base: string, segments: readonly PropertyKey[]): string =>
  [base, ...segments.map(String)].filter((part) => part !== '').join('.');

/** Every issue of a failed parse as an error at its own path below `base`. */
export function zodFindings(
  parsed: z.ZodSafeParseResult<unknown>,
  base: string,
  suffix = '',
): Finding[] {
  return parsed.success
    ? []
    : parsed.error.issues.map((found) =>
        errorAt(dotted(base, found.path), `${found.message}${suffix}`),
      );
}
