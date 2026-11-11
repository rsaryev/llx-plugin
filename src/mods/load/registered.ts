import type {
  AgentType,
  CommandDef,
  ModRegistries,
  RegisteredKind,
  ToolDef,
} from '../api/registries.ts';

/**
 * What mods registered, as a host reads it (`ModsHost.registered`): the commands to list and run
 * (`$.command.register`), the tools to expose under the name Claude sees (`$.tool.register`), the
 * subagent types to offer (`$.agent.register`), and a word each time one of them changes (a
 * registration, or a mod turned off, reloaded or unloaded taking its own). Read only: the lists are
 * frozen copies, and nothing here writes the kit's registries.
 */
export interface ModsRegistered {
  commands(): readonly CommandDef[];
  /** The registered command named `name` (no `/`). */
  command(name: string): CommandDef | undefined;
  tools(): readonly ToolDef[];
  /** The registered tool Claude calls `fullName` (`mcp__<plugin>__<name>`). */
  tool(fullName: string): ToolDef | undefined;
  agents(): readonly AgentType[];
  /** The registered subagent type `name`, as the mod named it. */
  agent(name: string): AgentType | undefined;
  /** Calls `listener` after each change, with the list that changed; answers the call that stops it. */
  onChange(listener: (kind: RegisteredKind) => void): () => void;
}

const frozen = <T>(items: readonly T[]): readonly T[] =>
  Object.freeze(items.map((one) => Object.freeze({ ...one })));

/** The read surface over `registries`. */
export const registeredView = (registries: ModRegistries): ModsRegistered =>
  Object.freeze({
    commands: () => frozen(registries.commands.list()),
    command: (name: string) => registries.commands.get(name),
    tools: () => frozen(registries.tools.list()),
    tool: (fullName: string) => registries.tools.get(fullName),
    agents: () => frozen(registries.agents.list()),
    agent: (name: string) => registries.agents.get(name),
    onChange: (listener: (kind: RegisteredKind) => void) => registries.onChange(listener),
  });
