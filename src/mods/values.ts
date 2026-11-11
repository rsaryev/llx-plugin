import type { z } from 'zod';

/** The first problem a zod check found, as one phrase: `decision: Invalid option`. */
export function zodProblem(error: z.ZodError): string {
  const [first] = error.issues;
  if (!first) return 'does not fit';
  const where = first.path.join('.');
  return where === '' ? first.message : `${where}: ${first.message}`;
}
