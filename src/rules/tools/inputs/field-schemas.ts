import { z } from 'zod';

/**
 * The zod building blocks of the tool input tables (hooks.md, "PreToolUse input"). A message says
 * what is wrong with the value: `is required` for a field that is absent, `expected ...` for one of
 * another type. The issue path is added by `parseToolInput`.
 */
const wrongValue =
  (expected: string) =>
  (issue: { readonly input?: unknown }): string =>
    issue.input === undefined ? 'is required' : `expected ${expected}`;

export const text = z.string({ error: wrongValue('a string') });
export const num = z.number({ error: wrongValue('a number') });
export const flag = z.boolean({ error: wrongValue('a boolean') });
export const list = <T extends z.ZodType>(item: T) =>
  z.array(item, { error: wrongValue('an array') });
export const record = <T extends z.ZodType>(value: T) =>
  z.record(z.string(), value, { error: wrongValue('an object') });
export const choice = (values: readonly [string, ...string[]]) =>
  z.enum(values, {
    error: (issue) =>
      issue.input === undefined ? 'is required' : `expected one of ${values.join(', ')}`,
  });
