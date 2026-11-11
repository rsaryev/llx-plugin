import type { HooksSettings } from '../protocol/hook-config.ts';
import { HOOK_EVENTS } from '../protocol/hook-events.ts';
import type { HookSource, RegisteredHandler } from './contracts.ts';

/** Where a hooks file was declared: what every entry made from it carries. */
export interface HookDeclaration {
  /** Prefix of the entry ids; two declarations of one registry never share one. */
  readonly idPrefix: string;
  readonly source: HookSource;
  /** The full `name@marketplace` id of the plugin, for a plugin's hooks. */
  readonly pluginId?: string;
}

/**
 * A hooks file, in the shape of the `hooks` key of settings (hooks.md, "Configuration"; a plugin's
 * `hooks/hooks.json` wraps it the same way), as the handlers a registry holds: one entry per
 * handler, in file order, with the matcher of its group and where it was declared. The handler
 * stays the official object. A key that names no event of the official union registers nothing:
 * no input is ever built for it.
 */
export function registerHooks(
  hooks: HooksSettings,
  declaration: HookDeclaration,
): readonly RegisteredHandler[] {
  const { idPrefix, source, pluginId } = declaration;
  return Object.entries(hooks).flatMap(([name, groups]) => {
    const event = HOOK_EVENTS.find((known) => known === name);
    if (event === undefined) return [];
    return groups.flatMap((group, groupAt) =>
      group.hooks.map((handler, handlerAt): RegisteredHandler => ({
        id: `${idPrefix}:${event}:${groupAt}:${handlerAt}`,
        event,
        ...(group.matcher === undefined ? {} : { matcher: group.matcher }),
        handler,
        source,
        ...(pluginId === undefined ? {} : { pluginId }),
      })),
    );
  });
}
