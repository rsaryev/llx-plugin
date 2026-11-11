import type { AgentDefinition } from '../../protocol/official.ts';
import { asyncSlot } from '../async-slot.ts';
import type { AsyncContextFactory } from '../ports.ts';
import type { SessionBackdrop } from './ports.ts';

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

/** What the registries hold: what a host lists, and what it is told changed. */
export type RegisteredKind = 'commands' | 'tools' | 'agents';

/** `changed` is called after each change: a registration, or a plugin's that were forgotten. */
function createRegistry<T extends { readonly plugin: string }>(changed: () => void): Registry<T> {
  const entries = new Map<string, T>();
  return {
    get: (key) => entries.get(key),
    set: (key, value) => {
      entries.set(key, value);
      changed();
    },
    list: () => [...entries.values()],
    removePlugin(plugin) {
      const owned = [...entries].filter(([, value]) => value.plugin === plugin);
      for (const [key] of owned) entries.delete(key);
      if (owned.length > 0) changed();
    },
  };
}

/** The listeners told which registry changed; a listener that throws does not stop the others. */
function createListeners(): {
  readonly tell: (kind: RegisteredKind) => void;
  readonly add: (listener: (kind: RegisteredKind) => void) => () => void;
} {
  const listeners = new Set<(kind: RegisteredKind) => void>();
  return {
    tell: (kind) => {
      for (const listener of listeners) {
        try {
          listener(kind);
        } catch {
          // The host's listener failing is the host's; the registration stands.
        }
      }
    },
    add: (listener) => {
      const own = (kind: RegisteredKind): void => listener(kind);
      listeners.add(own);
      return () => void listeners.delete(own);
    },
  };
}

/**
 * The session's one backdrop (interface.md, "Put a backdrop behind the conversation"): a
 * `$.theme.set` replaces it and `$.theme.clear` removes it, whichever mod set it. The host reads it
 * to raise the `Backdrop` site.
 */
export interface BackdropBoard {
  current(): SessionBackdrop | undefined;
  set(backdrop: SessionBackdrop): void;
  /** Takes the backdrop off; `true` when there was one. */
  clear(): boolean;
  /** Takes the backdrop off when `plugin` set it (its module unloaded); `true` when it did. */
  removePlugin(plugin: string): boolean;
}

function createBackdropBoard(): BackdropBoard {
  let backdrop: SessionBackdrop | undefined;
  const clear = (): boolean => {
    const had = backdrop !== undefined;
    backdrop = undefined;
    return had;
  };
  return {
    current: () => backdrop,
    set: (next) => void (backdrop = next),
    clear,
    removePlugin: (plugin) => backdrop?.plugin === plugin && clear(),
  };
}

export interface ModRegistries {
  readonly commands: Registry<CommandDef>;
  readonly tools: Registry<ToolDef>;
  readonly agents: Registry<AgentType>;
  readonly backdrop: BackdropBoard;
  /** Calls `listener` after each change of `commands`, `tools` or `agents`; answers the call that stops it. */
  readonly onChange: (listener: (kind: RegisteredKind) => void) => () => void;
  /** The commands whose body runs now, past their `command.run` chain (`CommandRuns`). */
  readonly commandRuns: CommandRuns;
}

/** Where a `command.run` stands for the host's nested `runCommand`. */
export type CommandRunDepth = 'outside' | 'body' | 'collapsed';

/**
 * The commands whose body (`ModsHost.runCommand`'s `options.core`, `ModCommands.run`) runs now,
 * followed across `await` by the host's `AsyncContext`; without one every run is `outside`.
 */
export interface CommandRuns {
  /** Runs `body` as the body of `command`, `collapsed` when it stands for a nested `runCommand`. */
  within<T>(command: string, depth: Exclude<CommandRunDepth, 'outside'>, body: () => T): T;
  /** Whether the caller is inside the body of `command`, and at which depth. */
  depth(command: string): CommandRunDepth;
}

function createCommandRuns(asyncContext: AsyncContextFactory | undefined): CommandRuns {
  const slot = asyncSlot<{ readonly command: string; readonly depth: CommandRunDepth }>(
    asyncContext,
  );
  return {
    within: (command, depth, body) =>
      slot === undefined ? body() : slot.run({ command, depth }, body),
    depth: (command) => {
      const run = slot?.current();
      return run?.command === command ? run.depth : 'outside';
    },
  };
}

/** The registries of one mods host; `asyncContext` follows the command runs (`CommandRuns`). */
export function createRegistries(asyncContext?: AsyncContextFactory): ModRegistries {
  const listeners = createListeners();
  return {
    commandRuns: createCommandRuns(asyncContext),
    commands: createRegistry(() => listeners.tell('commands')),
    tools: createRegistry(() => listeners.tell('tools')),
    agents: createRegistry(() => listeners.tell('agents')),
    backdrop: createBackdropBoard(),
    onChange: listeners.add,
  };
}

/** The name Claude sees for a tool a mod registered: `mcp__`, the plugin's name, `__`, the tool's name (api.md, "Add a tool"). */
export const toolFullName = (plugin: string, name: string): string => `mcp__${plugin}__${name}`;

/** A plugin's subagent type as the engine names it: `<plugin>:<name>` (claude-code/index.d.ts:3394). */
export const agentFullName = (plugin: string, name: string): string => `${plugin}:${name}`;
