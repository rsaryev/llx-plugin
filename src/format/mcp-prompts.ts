import type { Prompt, PromptArgument } from '../protocol/official.ts';
import { normalizeMcpServerName } from './mcp-tool.ts';

/**
 * MCP prompts as commands (mcp.md, "Use MCP prompts as commands", "Execute MCP prompts"). A connected
 * server's prompts are listed as `/servername:promptname (MCP)` and run by typing
 * `/mcp__servername__promptname` followed by space-separated arguments. Pure over the prompts the
 * host listed with `prompts/list`; `prompts/get` and injecting the result into the conversation are the
 * host's.
 */
export type McpPromptDefinition = Pick<Prompt, 'name' | 'description'> & {
  readonly server: string;
  /** The prompt's defined parameters, in order. */
  readonly arguments?: readonly Pick<PromptArgument, 'name' | 'description' | 'required'>[];
};

/** The parameters of `prompts/get`. */
export interface McpPromptInvocation {
  readonly server: string;
  readonly prompt: string;
  readonly arguments: Readonly<Record<string, string>>;
}

export type McpPromptRead =
  | { readonly status: 'not-a-prompt' }
  | { readonly status: 'invoke'; readonly invocation: McpPromptInvocation }
  | { readonly status: 'refused'; readonly message: string };

/** "Prompts from a server named `anthropic-skills` don't appear": the name is reserved for synced skills. */
const RESERVED_SERVER = 'anthropic-skills';

export const listablePrompts = (prompts: readonly McpPromptDefinition[]): McpPromptDefinition[] =>
  prompts.filter((prompt) => prompt.server !== RESERVED_SERVER);

/**
 * "Claude Code lists each MCP prompt as `/servername:promptname (MCP)`". Judgment (spec/judgments.md):
 * both names as configured and declared, since only the typed form is said to be normalised.
 */
export const mcpPromptListing = (server: string, prompt: string): string =>
  `/${server}:${prompt} (MCP)`;

const COMMAND_PREFIX = 'mcp__';

/**
 * "In the `/mcp__servername__promptname` form, Claude Code replaces any character in the server name
 * outside `A-Z`, `a-z`, `0-9`, `_`, and `-` with `_`, and uses the prompt name as the server declares it."
 */
export const mcpPromptCommand = (server: string, prompt: string): string =>
  `${COMMAND_PREFIX}${normalizeMcpServerName(server)}__${prompt}`;

const refused = (message: string): McpPromptRead => ({ status: 'refused', message });

/**
 * "Pass them space-separated after the command. Claude Code splits the arguments on whitespace, so
 * each argument is a single token": no quoting. They go to the prompt's defined parameters in order.
 * Judgments (spec/judgments.md): a prompt takes no more arguments than it declares and needs its
 * required ones; two prompts with one command are answered by the first listed; the wording of a refusal.
 */
export function readMcpPromptInvocation(
  input: string,
  prompts: readonly McpPromptDefinition[],
): McpPromptRead {
  const [word = '', ...tokens] = input.trim().split(/\s+/);
  if (!word.startsWith(`/${COMMAND_PREFIX}`)) return { status: 'not-a-prompt' };
  const command = word.slice(1);
  const prompt = listablePrompts(prompts).find(
    (each) => mcpPromptCommand(each.server, each.name) === command,
  );
  if (prompt === undefined) return refused(`No MCP prompt matches ${word}`);
  const declared = prompt.arguments ?? [];
  if (tokens.length > declared.length) {
    return refused(`${word} takes ${declared.length} argument(s) and was given ${tokens.length}`);
  }
  const missing = declared.slice(tokens.length).filter((each) => each.required === true);
  if (missing.length > 0) {
    return refused(`${word} needs ${missing.map((each) => each.name).join(', ')}`);
  }
  const given = Object.fromEntries(tokens.map((token, at) => [declared[at]?.name ?? '', token]));
  return {
    status: 'invoke',
    invocation: { server: prompt.server, prompt: prompt.name, arguments: given },
  };
}
