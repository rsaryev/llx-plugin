import { z } from 'zod';
import {
  HOOK_HANDLER_TYPES,
  type HookHandler,
  type HookHandlerOf,
  type HookHandlerType,
} from '../protocol/hook-config.ts';
import { error, warning, type PluginIssue } from './issues.ts';
import { isRecord } from '../protocol/is-record.ts';

/**
 * Hook handlers (hooks.md, "Hook handler fields"): the five types and the fields each accepts,
 * bound to the official `HookHandlerOf<T>` so an SDK update that adds a field fails the typecheck
 * here. The common fields apply to every type; the rest are the type's own.
 */

// Judgment (spec/judgments.md): a timeout is a positive, finite number of seconds.
const SECONDS_MESSAGE = 'expected a positive, finite number of seconds';
const seconds = z
  .number({ error: SECONDS_MESSAGE })
  .positive({ error: SECONDS_MESSAGE })
  .finite({ error: SECONDS_MESSAGE });
const text = z.string();
const flag = z.boolean();
const textList = z.array(text);

/** `type` is the discriminator; the other common fields are optional on every type. */
const common = {
  if: text.exactOptional(),
  timeout: seconds.exactOptional(),
  statusMessage: text.exactOptional(),
  once: flag.exactOptional(),
};

const onFailure = z.enum(['continue', 'block']);

const commandSchema = z.object({
  type: z.literal('command'),
  // Judgment: an empty command names nothing to run.
  command: text.min(1),
  args: textList.exactOptional(),
  async: flag.exactOptional(),
  asyncRewake: flag.exactOptional(),
  shell: z.enum(['bash', 'powershell']).exactOptional(),
  onFailure: onFailure.exactOptional(),
  ...common,
});

const httpSchema = z.object({
  type: z.literal('http'),
  url: text,
  headers: z.record(text, text).exactOptional(),
  allowedEnvVars: textList.exactOptional(),
  onFailure: onFailure.exactOptional(),
  ...common,
});

const mcpToolSchema = z.object({
  type: z.literal('mcp_tool'),
  server: text,
  tool: text,
  input: z.record(text, z.unknown()).exactOptional(),
  ...common,
});

const promptSchema = z.object({
  type: z.literal('prompt'),
  prompt: text,
  model: text.exactOptional(),
  // In the official type, not in the docs' field table: what `ok: false` does (hooks.md, "Prompt-based hooks").
  continueOnBlock: flag.exactOptional(),
  ...common,
});

const agentSchema = z.object({
  type: z.literal('agent'),
  prompt: text,
  model: text.exactOptional(),
  ...common,
});

/** The schema of each handler type, one entry per member of the official union. */
const HANDLER_SCHEMAS = {
  command: commandSchema,
  http: httpSchema,
  mcp_tool: mcpToolSchema,
  prompt: promptSchema,
  agent: agentSchema,
} satisfies { readonly [T in HookHandlerType]: z.ZodType<HookHandlerOf<T>> };

const isHandlerType = (value: unknown): value is HookHandlerType =>
  typeof value === 'string' && Object.hasOwn(HANDLER_SCHEMAS, value);

const quoted = (names: readonly string[]): string => names.map((name) => `"${name}"`).join(', ');

/** Every field some handler type has, so a stray field can be told from another type's. */
const KNOWN_FIELDS: ReadonlySet<string> = new Set(
  Object.values(HANDLER_SCHEMAS).flatMap((schema) => Object.keys(schema.shape)),
);

function strayFieldIssues(
  raw: Record<string, unknown>,
  type: HookHandlerType,
  path: string,
): PluginIssue[] {
  const own = Object.keys(HANDLER_SCHEMAS[type].shape);
  return Object.keys(raw)
    .filter((key) => !own.includes(key))
    .map((key) =>
      warning(
        `${path}.${key}`,
        KNOWN_FIELDS.has(key)
          ? `"${key}" is not a field of a ${type} hook and is ignored`
          : `Unknown field "${key}" is ignored`,
      ),
    );
}

/** Exec form (hooks.md, "Exec form and shell form"): `command` is an executable name or path only. */
function execFormIssues(handler: HookHandler, path: string): PluginIssue[] {
  if (!('command' in handler) || handler.args === undefined) return [];
  const bare = !/[/\\]/.test(handler.command);
  return bare && /\s/.test(handler.command)
    ? [
        warning(
          `${path}.command`,
          `"${handler.command}" holds whitespace beside "args": exec form spawns an executable of that name, so the spawn will fail. Move the extra tokens into "args"`,
        ),
      ]
    : [];
}

/** Reported at the field, whatever depth inside it the value is wrong (`args`, not `args.0`). */
const fieldProblem = (path: string, issue: z.core.$ZodIssue): PluginIssue => {
  const [field] = issue.path;
  return field === undefined
    ? error(path, `Invalid hook handler: ${issue.message}`)
    : error(`${path}.${String(field)}`, `Invalid "${String(field)}": ${issue.message}`);
};

export interface HandlerRead {
  /** Undefined when the handler has an error. */
  readonly handler: HookHandler | undefined;
  readonly issues: readonly PluginIssue[];
}

/** Reads one handler object at `path` (`hooks.PreToolUse[0].hooks[1]`). */
export function readHandler(raw: unknown, path: string): HandlerRead {
  if (!isRecord(raw)) {
    return { handler: undefined, issues: [error(path, 'A hook handler must be an object')] };
  }
  if (!isHandlerType(raw.type)) {
    const message = `Invalid "type": expected one of ${quoted(HOOK_HANDLER_TYPES)}`;
    return { handler: undefined, issues: [error(`${path}.type`, message)] };
  }
  const parsed = HANDLER_SCHEMAS[raw.type].safeParse(raw);
  const stray = strayFieldIssues(raw, raw.type, path);
  if (!parsed.success) {
    return {
      handler: undefined,
      issues: [...parsed.error.issues.map((issue) => fieldProblem(path, issue)), ...stray],
    };
  }
  return { handler: parsed.data, issues: [...stray, ...execFormIssues(parsed.data, path)] };
}
