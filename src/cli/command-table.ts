/**
 * The commands `claude` takes that this module knows (cli-reference.md, "CLI commands";
 * plugins/cli-reference.md, "claude plugin commands" and "claude plugin marketplace commands"): the
 * names, the aliases and who runs each. The kit has no CLI of its own; a `planned` command is one
 * whose outcome the kit models as a plan over ports, a `host-delegated` one is another product
 * feature (agent view, MCP servers and their OAuth) the host runs, recorded here so a host that routes
 * words to commands has one table. A registry typed over the documented names: no `switch`.
 */

/** `claude plugin <subcommand>`; `claude plugin eval init` is a command of `eval`. */
export const PLUGIN_SUBCOMMANDS = [
  'init',
  'install',
  'uninstall',
  'enable',
  'disable',
  'update',
  'list',
  'details',
  'configure',
  'prune',
  'eval',
  'tag',
  'test',
  'validate',
  'marketplace',
] as const;
export type PluginSubcommand = (typeof PLUGIN_SUBCOMMANDS)[number];

/** `claude plugin marketplace <subcommand>`. */
export const MARKETPLACE_SUBCOMMANDS = ['add', 'list', 'remove', 'update'] as const;
export type MarketplaceSubcommand = (typeof MARKETPLACE_SUBCOMMANDS)[number];

/** `claude mcp login` and `claude mcp logout` are listed beside `claude mcp`. */
export const MCP_SUBCOMMANDS = ['login', 'logout'] as const;
export type McpSubcommand = (typeof MCP_SUBCOMMANDS)[number];

export type CommandName =
  | 'plugin'
  | `plugin ${PluginSubcommand}`
  | `plugin marketplace ${MarketplaceSubcommand}`
  | 'agents'
  | 'mcp'
  | `mcp ${McpSubcommand}`;

export const COMMAND_HANDLINGS = ['planned', 'host-delegated'] as const;
export type CommandHandling = (typeof COMMAND_HANDLINGS)[number];

export interface CommandRow {
  /** Other words that run the same command, at the same position. */
  readonly aliases: readonly string[];
  readonly handling: CommandHandling;
  /**
   * What a word that is none of the command's subcommands is: `unknown` for `claude plugin` and
   * `claude plugin marketplace` (`claude plugin add` is "unknown command 'add'"), `argument` for a
   * command that takes arguments of its own.
   */
  readonly unlistedWord: 'unknown' | 'argument';
}

const planned = (...aliases: string[]): CommandRow => ({
  aliases,
  handling: 'planned',
  unlistedWord: 'argument',
});
const parent: CommandRow = { aliases: [], handling: 'planned', unlistedWord: 'unknown' };
const delegated: CommandRow = { aliases: [], handling: 'host-delegated', unlistedWord: 'argument' };

/** Every command with its aliases; a name added to a union above fails the typecheck until it has a row. */
export const COMMAND_TABLE: { readonly [C in CommandName]: CommandRow } = {
  plugin: { ...parent, aliases: ['plugins'] },
  'plugin init': planned('new'),
  'plugin install': planned('i'),
  'plugin uninstall': planned('remove', 'rm'),
  'plugin enable': planned(),
  'plugin disable': planned(),
  'plugin update': planned(),
  'plugin list': planned(),
  'plugin details': planned(),
  'plugin configure': planned(),
  'plugin prune': planned('autoremove'),
  'plugin eval': planned(),
  'plugin tag': planned(),
  'plugin test': planned(),
  'plugin validate': planned(),
  'plugin marketplace': parent,
  'plugin marketplace add': planned(),
  'plugin marketplace list': planned(),
  'plugin marketplace remove': planned('rm'),
  'plugin marketplace update': planned(),
  agents: delegated,
  mcp: delegated,
  'mcp login': delegated,
  'mcp logout': delegated,
};

export interface ResolvedCommand {
  readonly command: CommandName;
  readonly handling: CommandHandling;
  /** The words after the command, for its own parsing. */
  readonly rest: readonly string[];
}

const isCommandName = (text: string): text is CommandName => Object.hasOwn(COMMAND_TABLE, text);
const NAMES: readonly CommandName[] = Object.keys(COMMAND_TABLE).filter(isCommandName);

const lastWord = (name: string): string => name.slice(name.lastIndexOf(' ') + 1);

/** The commands one word below `above` (`''` for the top level). */
function childrenOf(above: string): readonly CommandName[] {
  const prefix = above === '' ? '' : `${above} `;
  return NAMES.filter(
    (name) => name.startsWith(prefix) && !name.slice(prefix.length).includes(' ') && name !== above,
  );
}

const answersTo = (name: CommandName, word: string): boolean =>
  lastWord(name) === word || COMMAND_TABLE[name].aliases.includes(word);

/** Whether the words left after a command name something its table row calls unknown. */
const strandsUnknownWord = (found: CommandName, rest: readonly string[]): boolean =>
  COMMAND_TABLE[found].unlistedWord === 'unknown' &&
  rest[0] !== undefined &&
  !rest[0].startsWith('-');

/**
 * The command the words name, by name or alias, at each level. `claude plugin add` is unknown; a
 * word below `claude mcp` or `claude agents` that the table does not list is that command's own
 * argument, so the host keeps it in `rest`.
 */
export function resolveCommand(words: readonly string[]): ResolvedCommand | undefined {
  let found: CommandName | undefined;
  let rest = words;
  for (let word = rest[0]; word !== undefined; word = rest[0]) {
    const next = childrenOf(found ?? '').find((name) => answersTo(name, word));
    if (next === undefined) break;
    found = next;
    rest = rest.slice(1);
  }
  if (found === undefined || strandsUnknownWord(found, rest)) return undefined;
  return { command: found, handling: COMMAND_TABLE[found].handling, rest };
}
