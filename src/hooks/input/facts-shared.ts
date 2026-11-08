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

export const nonNegative = z.number().nonnegative();
export const count = z.int().nonnegative();
