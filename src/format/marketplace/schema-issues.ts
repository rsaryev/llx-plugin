import type { z } from 'zod';
import { error, type PluginIssue } from '../issues.ts';

/**
 * Reports of a zod parse as plugin issues: the validator's own wording ("Invalid input: expected
 * string, received number") at the path of the value, written the way the docs write an entry's
 * paths (`plugins[1].tags[0]`).
 */

/** `base` followed by zod's path segments: an index is `[n]`, a key is `.key`. */
function pathOf(base: string, segments: readonly PropertyKey[]): string {
  return segments.reduce<string>((path, segment) => {
    if (typeof segment === 'number') return `${path}[${segment}]`;
    return typeof segment === 'string' ? `${path}.${segment}` : path;
  }, base);
}

/** One error per problem zod found, each at its own path below `base`. */
export const zodIssues = (failure: z.ZodError, base: string): PluginIssue[] =>
  failure.issues.map((found) => error(pathOf(base, found.path), found.message));
