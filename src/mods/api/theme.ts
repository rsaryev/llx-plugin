import { z } from 'zod';
import type { ModsNamespaceApi } from '../types.ts';
import { call, parse, type Deps } from './call.ts';
import { nameProblem } from './names.ts';
import type { BackdropDrawn, SessionBackdrop } from './ports.ts';

/**
 * `$.theme` (interface.md, "Put a backdrop behind the conversation"; reference.md, "Mods API
 * methods"): `set` puts a backdrop behind the conversation for the Desktop or mobile app to draw at
 * the `Backdrop` site, and `clear` takes it off. The session has one backdrop, whichever mod set it.
 */

/** What `$.theme.clear` resolves with: the reason the docs quote, `the theme is cleared`. */
export const THEME_CLEARED = 'the theme is cleared';

/** The request id of a backdrop at `ui.render`. */
const BACKDROP_REQUEST = 'backdrop';

/** `id` is a name you choose (reference.md, "Limits"); `colorScheme` is `'light'` or `'dark'`. */
const backdropFields = z.looseObject({
  id: z.string(),
  colorScheme: z.enum(['light', 'dark']).optional(),
  glass: z.unknown().optional(),
});
// Judgment: the docs name `backdrop` as what `set` takes and no other field, so it is required.
const setArgs = z.looseObject({ backdrop: backdropFields });

/** The backdrop `set` was given, as the `Backdrop` site's props, or the reason the call rejects. */
function backdropOf(deps: Deps, event: unknown): SessionBackdrop {
  const { backdrop } = parse('$.theme.set', setArgs, event);
  const problem = nameProblem('backdrop', backdrop.id);
  if (problem !== undefined) throw new Error(`$.theme.set: ${problem}`);
  return {
    id: backdrop.id,
    plugin: deps.plugin,
    ...(backdrop.colorScheme === undefined ? {} : { colorScheme: backdrop.colorScheme }),
    ...(backdrop.glass === undefined ? {} : { glass: backdrop.glass }),
  };
}

/**
 * Drawn, the answer carries `requestId` `backdrop`, "the `e.requestId` of every backdrop at
 * `ui.render`" (claude-code/index.d.ts:14072).
 */
async function set(deps: Deps, event: unknown): Promise<BackdropDrawn & { requestId?: string }> {
  const backdrop = backdropOf(deps, event);
  deps.registries.backdrop.set(backdrop);
  deps.ports.theme.changed(backdrop);
  const drawn = await deps.ports.theme.drawn();
  return drawn.isDrawn ? { ...drawn, requestId: BACKDROP_REQUEST } : drawn;
}

/** Judgment: `clear` resolves `{ isDrawn: false, reason }`, the shape of `set`'s result, even with no backdrop set. */
function clear(deps: Deps): Promise<BackdropDrawn> {
  if (deps.registries.backdrop.clear()) deps.ports.theme.changed(undefined);
  return Promise.resolve({ isDrawn: false, reason: THEME_CLEARED });
}

export const themeApi = (deps: Deps): ModsNamespaceApi<'theme'> => ({
  set: async (...args) => {
    backdropOf(deps, args[0]);
    return call(deps, 'theme.set', parse('$.theme.set', setArgs, args[0]), (e) => set(deps, e));
  },
  clear: async () => call(deps, 'theme.clear', {}, () => clear(deps)),
});
