/**
 * The model a built-in subagent runs on when the model order of "Choose a model" ends at the main
 * conversation's model (sub-agents.md, "Built-in subagents"). Only Explore has a rule: "When the main
 * conversation runs Fable, Explore's model depends on how you connect".
 */

/** How the session reaches Claude, as far as the Explore rule tells the ways apart. */
export const CONNECTIONS = [
  'subscription',
  'console',
  'llm-gateway',
  'bedrock',
  'vertex',
  'foundry',
  'claude-platform-on-aws',
  'claude-apps-gateway',
] as const;
export type Connection = (typeof CONNECTIONS)[number];

/** A built-in, and the connection it is run over. */
export interface BuiltinModelInput {
  readonly name: string;
  readonly connection: Connection;
}

/**
 * Whether Fable on the main conversation moves Explore to the `opus` alias: "With a Claude subscription,
 * an Anthropic Console account, or an LLM gateway reached through `ANTHROPIC_BASE_URL`"; "On Amazon
 * Bedrock, Google Cloud's Agent Platform, Microsoft Foundry, Claude Platform on AWS, or a Claude apps
 * gateway, Explore stays on the main conversation's model".
 */
const FABLE_MOVES_TO_OPUS: { readonly [C in Connection]: boolean } = {
  subscription: true,
  console: true,
  'llm-gateway': true,
  bedrock: false,
  vertex: false,
  foundry: false,
  'claude-platform-on-aws': false,
  'claude-apps-gateway': false,
};

/** The alias a rule picks; the host resolves it to a version. */
const OPUS = 'opus';

type Rule = (input: BuiltinModelInput, mainFamily: string | undefined) => string | undefined;

const exploreRule: Rule = ({ connection }, mainFamily) =>
  mainFamily === 'fable' && FABLE_MOVES_TO_OPUS[connection] ? OPUS : undefined;

/** The built-ins that have a model rule of their own; every other follows the main model. */
const RULES: ReadonlyMap<string, Rule> = new Map([['Explore', exploreRule]]);

/** The alias a built-in's rule picks, or `undefined` when it follows the main conversation's model. */
export function builtinModelAlias(
  input: BuiltinModelInput | undefined,
  mainFamily: string | undefined,
): string | undefined {
  if (input === undefined) return undefined;
  return RULES.get(input.name)?.(input, mainFamily);
}
