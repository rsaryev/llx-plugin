import { z } from 'zod';
import type { ModsNamespaceApi } from '../types.ts';
import { call, isRecord, parse, type Deps } from '../api/call.ts';
import { defaultElementTable, type ElementTable } from './elements/table.ts';
import { RENDER_SITE_NAMES, SURFACES } from '../../protocol/mods-ui-names.ts';
import { parseOpen } from './panes/open.ts';
import type { PaneRegistry } from './panes/registry.ts';
import type { ModInterface } from './ports.ts';
import type { Invalidator } from './redraw/invalidate.ts';
import type { ElementTables } from './tables.ts';
import { parseToast, type ToastBoard } from './toast.ts';

/** What `$.ui` reaches: the interface a host draws, and what the kit keeps for it. */
export interface UiParts {
  readonly iface: ModInterface;
  readonly panes: PaneRegistry;
  readonly invalidator: Invalidator;
  readonly toasts: ToastBoard;
  readonly tables: ElementTables;
}

const textEvent = z.looseObject({ text: z.string() });
const notifyEvent = z.looseObject({ text: z.string(), title: z.string().optional() });
const askEvent = z.looseObject({ question: z.string(), options: z.array(z.string()) });
const idEvent = z.looseObject({ id: z.string() });

/** `⚠ my-mod: checks: 3 passing` (api.md, "Show something without starting a turn"). */
export const statusLine = (plugin: string, text: string): string => `⚠ ${plugin}: ${text}`;
/** `● my-mod: build finished`. */
export const logLine = (plugin: string, text: string): string => `● ${plugin}: ${text}`;

const asRecord = (value: unknown): Readonly<Record<string, unknown>> =>
  isRecord(value) ? value : {};

/**
 * `$.ui.resolve(e)`: the elements the app of `e` draws for the site of `e`, as `ui.resolve` left
 * them for this mod when mods loaded. It answers at once, as the docs destructure it without `await`.
 */
function resolve(deps: Deps, parts: UiParts, e: unknown): ElementTable {
  const site = RENDER_SITE_NAMES.find((name) => name === asRecord(e).component);
  const surface = SURFACES.find((name) => name === asRecord(e).surface);
  if (!site || !surface) throw new Error('$.ui.resolve: takes the event of a ui.render hook');
  return parts.tables.get(deps.plugin, surface, site) ?? defaultElementTable(surface);
}

function toast(deps: Deps, parts: UiParts, event: unknown): void {
  const parsed = parseToast(asRecord(event).text, event);
  if ('problem' in parsed) {
    deps.debug(`${deps.plugin}: $.ui.toast dropped: ${parsed.problem}`);
    return;
  }
  deps.debug(`$.ui.toast (${deps.plugin}): ${parsed.toast.text}`);
  parts.toasts.show(deps.plugin, parsed.toast);
}

/** The first two members of `$.ui` that touch panes: `open`, `close`, `panes`. */
function paneMembers(deps: Deps, parts: UiParts) {
  const { panes, iface } = parts;
  return {
    open: async (...args: readonly unknown[]) => {
      const request = parseOpen(args[0]);
      return call(deps, 'ui.open', request, (e) =>
        Promise.resolve(
          panes.open(deps.plugin, parseOpen(e), iface.origin(), {
            surface: iface.surface(),
            viewport: iface.viewport(),
          }),
        ),
      );
    },
    close: async (...args: readonly unknown[]) => {
      const { id } = parse('$.ui.close', idEvent, asRecord(args[0]));
      return call(deps, 'ui.close', { id, origin: { kind: 'plugin' } }, (e) => {
        panes.remove(parse('$.ui.close', idEvent, e).id);
        return Promise.resolve(undefined);
      });
    },
    panes: async () =>
      call(deps, 'ui.panes', {}, () =>
        Promise.resolve(
          panes.list().map(({ id, request, isPlaced }) => ({ id, title: request.title, isPlaced })),
        ),
      ),
  };
}

/** The members that show something: `toast`, `notify`, `status`, `log`. */
function showMembers(deps: Deps, parts: UiParts) {
  const { iface } = parts;
  const text = (label: string, value: unknown): { text: string } =>
    parse(label, z.object({ text: z.string() }), { text: value });
  return {
    toast: async (...args: readonly unknown[]) =>
      call(deps, 'ui.toast', { text: args[0], ...asRecord(args[1]) }, (e) =>
        Promise.resolve(toast(deps, parts, e)),
      ),
    notify: async (...args: readonly unknown[]) => {
      const { title } = asRecord(args[1]);
      const input = {
        ...text('$.ui.notify', args[0]),
        ...(typeof title === 'string' && title !== '' ? { title } : {}),
      };
      let ran = false;
      const answered = await call(deps, 'ui.notify', input, (e) => {
        ran = true;
        const { text: body, title: given } = parse('$.ui.notify', notifyEvent, e);
        return iface.notify({ text: body, title: given ?? deps.plugin });
      });
      // "refused: Another mod's hook on ui.notify answered in Claude Code's place without sending"
      return ran ? answered : { isSent: false, reason: 'refused' };
    },
    status: async (...args: readonly unknown[]) =>
      call(deps, 'ui.status', text('$.ui.status', args[0]), (e) =>
        Promise.resolve(
          iface.status(statusLine(deps.plugin, parse('$.ui.status', textEvent, e).text)),
        ),
      ),
    log: async (...args: readonly unknown[]) =>
      call(deps, 'ui.log', text('$.ui.log', args[0]), (e) =>
        Promise.resolve(iface.log(logLine(deps.plugin, parse('$.ui.log', textEvent, e).text))),
      ),
  };
}

/** The members that pass through to the host: `ask`, `copy`, `selection`, `notice`, `blit`, `focus`, `scroll`. */
function hostMembers(deps: Deps, { iface }: UiParts) {
  const passThrough =
    (name: 'notice' | 'blit' | 'focus' | 'scroll') =>
    async (...args: readonly unknown[]) =>
      call(deps, `ui.${name}`, asRecord(args[0]), (e) => iface[name](asRecord(e)));
  return {
    ask: async (...args: readonly unknown[]) =>
      call(deps, 'ui.ask', { question: args[0], options: args[1] ?? [] }, (e) =>
        iface.ask(parse('$.ui.ask', askEvent, e)),
      ),
    copy: async (...args: readonly unknown[]) =>
      call(deps, 'ui.copy', { text: args[0] }, (e) =>
        iface.copy(parse('$.ui.copy', textEvent, e).text),
      ),
    selection: async () => call(deps, 'ui.selection', {}, () => iface.selection()),
    notice: passThrough('notice'),
    blit: passThrough('blit'),
    focus: passThrough('focus'),
    scroll: passThrough('scroll'),
  };
}

/**
 * `$.ui` for one mod (reference.md, "Mods API methods"): every call an event through the chain and
 * then the interface port. Pass `(deps) => uiApi(deps, parts)` as `ModsApiOptions.ui`.
 */
export function uiApi(deps: Deps, parts: UiParts): ModsNamespaceApi<'ui'> {
  return {
    resolve: (...args) => resolve(deps, parts, args[0]),
    invalidate: async (...args) => {
      // Judgment: the docs show only `'ui.render'`, so any other argument is refused.
      if (args[0] !== 'ui.render') throw new Error("$.ui.invalidate: takes 'ui.render'");
      return call(deps, 'ui.invalidate', { what: args[0] }, () =>
        Promise.resolve(parts.invalidator.invalidate()),
      );
    },
    ...paneMembers(deps, parts),
    ...showMembers(deps, parts),
    ...hostMembers(deps, parts),
  };
}
