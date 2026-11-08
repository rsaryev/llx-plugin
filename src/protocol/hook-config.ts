import type { Settings } from './official.ts';
import type { Assert, Equal } from './type-equality.ts';

/**
 * The shape of hook configuration, derived from the official `Settings` type (the `hooks` key of
 * `settings.json`, which a plugin's `hooks/hooks.json` wraps the same way; hooks.md,
 * "Configuration"). Nothing here is written by hand: an SDK update that adds a handler field or
 * type changes these types with it.
 */
export type HooksSettings = NonNullable<Settings['hooks']>;

/** One `{ matcher, hooks }` group under an event. */
export type HookMatcherGroup = HooksSettings[string][number];

/** One handler: a command, an HTTP request, an MCP tool call, a prompt or an agent. */
export type HookHandler = HookMatcherGroup['hooks'][number];

export type HookHandlerType = HookHandler['type'];

/** The handler of type `T`. */
export type HookHandlerOf<T extends HookHandlerType> = Extract<HookHandler, { type: T }>;

/** Every handler type, in the order hooks.md lists them ("Hook handler fields"). */
export const HOOK_HANDLER_TYPES = [
  'command',
  'http',
  'mcp_tool',
  'prompt',
  'agent',
] as const satisfies readonly HookHandlerType[];

/** @public A compile-time drift guard: the typecheck fails when the SDK changes the union. */
export type HookHandlerTypesMatchSdk = Assert<
  Equal<(typeof HOOK_HANDLER_TYPES)[number], HookHandlerType>
>;
