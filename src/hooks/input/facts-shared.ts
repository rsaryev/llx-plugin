import { z } from 'zod';

/** Building blocks the per-event facts schemas share. */

/** A field the docs call optional or "may be absent": absent from the facts, never `undefined`. */
export const optional = <T extends z.ZodType>(schema: T) => schema.exactOptional();

/**
 * A field typed `unknown` in the SDK (`tool_input`, `tool_response`) that the event always has:
 * any value but `undefined`, which JSON cannot carry.
 */
export const anyValue = z.custom<unknown>((value) => value !== undefined, {
  message: 'Required',
});

/** `mcp_server`: where an MCP tool came from (the SDK's `McpServerProvenance`). */
export const mcpServer = z.object({ name: z.string(), source: z.string() });

/**
 * A count the docs call "Zero-based index" or tokens (`index`, `context_tokens`): a non-negative
 * integer (spec/judgments.md for the tokens; the index is the docs' own word). Other numbers the
 * docs type only as "number" stay plain numbers.
 */
export const count = z.int().nonnegative();
