import type { AgentDefinition } from '../../protocol/official.ts';

/** A command a mod registered with `$.command.register`. */
export interface CommandDef {
  readonly plugin: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly argumentHint?: string | undefined;
  /** Runs while Claude is working. */
  readonly immediate?: boolean | undefined;
}

/** A tool a mod registered with `$.tool.register`; `fullName` is what Claude sees. */
export interface ToolDef {
  readonly plugin: string;
  readonly name: string;
  readonly fullName: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  /** `false` loads the tool upfront, `true` puts it behind tool search. */
  readonly isDeferred?: boolean | undefined;
}

/** A subagent type a mod registered with `$.agent.register`. */
export interface AgentType {
  readonly plugin: string;
  readonly name: string;
  readonly definition: AgentDefinition;
}

/** What a mod registered, by name. The host reads it to show the command, expose the tool, offer the subagent. */
export interface Registry<T extends { readonly plugin: string }> {
  /** The one registered under `key`, if any. */
  get(key: string): T | undefined;
  /** Adds or replaces (a module that reloads registers again). */
  set(key: string, value: T): void;
  list(): readonly T[];
  /** Forgets everything `plugin` registered. */
  removePlugin(plugin: string): void;
}

function createRegistry<T extends { readonly plugin: string }>(): Registry<T> {
  const entries = new Map<string, T>();
  return {
    get: (key) => entries.get(key),
    set: (key, value) => void entries.set(key, value),
    list: () => [...entries.values()],
    removePlugin(plugin) {
      for (const [key, value] of entries) if (value.plugin === plugin) entries.delete(key);
    },
  };
}

export interface ModRegistries {
  readonly commands: Registry<CommandDef>;
  readonly tools: Registry<ToolDef>;
  readonly agents: Registry<AgentType>;
}

export const createRegistries = (): ModRegistries => ({
  commands: createRegistry(),
  tools: createRegistry(),
  agents: createRegistry(),
});

/** The name Claude sees for a tool a mod registered: `mcp__`, the plugin's name, `__`, the tool's name (api.md, "Add a tool"). */
export const toolFullName = (plugin: string, name: string): string => `mcp__${plugin}__${name}`;
