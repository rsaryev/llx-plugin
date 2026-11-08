import { z } from 'zod';
import { unquotedMessage } from './shell-command.ts';
import { isRecord, withArticle } from './received.ts';

/**
 * The hook handler schemas of `claude plugin validate` (oracle 2.1.319): five types, each checked
 * for the fields it needs and the types of the common ones. A handler that fails is reported by
 * type and by field, in the order the validator tests them; anything else in it is left alone.
 */
const text = z.string();
const flag = z.boolean();
const seconds = z.number().positive();

const common = {
  if: text.optional(),
  timeout: seconds.optional(),
  statusMessage: text.optional(),
  once: flag.optional(),
};

const SCHEMAS = {
  command: z.object({
    command: text,
    args: z.array(text).optional(),
    shell: z.enum(['bash', 'powershell']).optional(),
    ...common,
    async: flag.optional(),
    asyncRewake: flag.optional(),
  }),
  prompt: z.object({ prompt: text, ...common, model: text.optional() }),
  agent: z.object({ prompt: text, ...common, model: text.optional() }),
  http: z.object({
    url: z.url(),
    ...common,
    headers: z.record(text, text).optional(),
  }),
  mcp_tool: z.object({ server: text, tool: text, ...common }),
} as const;
type HandlerType = keyof typeof SCHEMAS;
const isHandlerType = (value: string): value is HandlerType => Object.hasOwn(SCHEMAS, value);

const dottedPath = (segments: readonly PropertyKey[]): string => segments.map(String).join('.');

/** Why a handler cannot load, or `undefined` when it can. */
export function handlerProblem(handler: unknown): string | undefined {
  if (!isRecord(handler)) {
    return `Hook entry must be an object; received ${withArticle(handler)}`;
  }
  const { type } = handler;
  if (type === undefined) return 'Hook entry has no "type"';
  if (typeof type !== 'string') {
    return `Hook entry "type" must be a string; received ${withArticle(type)}`;
  }
  if (!isHandlerType(type)) return `Unknown hook type "${type}"`;
  const parsed = SCHEMAS[type].safeParse(handler);
  if (parsed.success) return undefined;
  const fields = parsed.error.issues
    .map((found) => `${dottedPath(found.path)}: ${found.message}`)
    .join('; ');
  return `Invalid ${type} hook (${fields})`;
}

/** The shell-form command of a handler, when it has one: no `args`, not PowerShell. */
function shellCommand(handler: Record<string, unknown>): string | undefined {
  const { command, args, shell } = handler;
  return typeof command === 'string' && args === undefined && shell !== 'powershell'
    ? command
    : undefined;
}

/** Handler types that run a shell command. */
const SHELL_FORM = { command: true } as const;

/** The unquoted-placeholder warning of a handler that loads, if it earns one. */
export function handlerAdvice(handler: unknown): string | undefined {
  if (!isRecord(handler) || typeof handler.type !== 'string') return undefined;
  if (!Object.hasOwn(SHELL_FORM, handler.type)) return undefined;
  const command = shellCommand(handler);
  return command === undefined ? undefined : unquotedMessage(command);
}
