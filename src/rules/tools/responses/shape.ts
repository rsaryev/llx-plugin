import { z } from 'zod';
import { error, type PluginIssue } from '../../../format/issues.ts';

/** The root of a PostToolUse payload: issues are reported at `tool_response.<field>`. */
export const RESPONSE_ROOT = 'tool_response';

/** An object whose absence is `is required` and whose wrong type is `expected an object`. */
export const objectOf = <T extends z.ZodRawShape>(shape: T) =>
  z.object(shape, {
    error: (issue) => (issue.input === undefined ? 'is required' : 'expected an object'),
  });

/** Zod's issues as the kit's, each at `<root>.<path>`. */
export const issuesOf = (root: string, failure: z.ZodError): readonly PluginIssue[] =>
  failure.issues.map((found) => error([root, ...found.path.map(String)].join('.'), found.message));
