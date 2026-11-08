import { ENGINE_ORIGIN } from '../../../protocol/mods-events.ts';
import type { Surface } from '../../../protocol/mods-ui-names.ts';
import type { HookReport, ModChain } from '../../types.ts';
import type { OpenRequest } from './open.ts';
import { placePane, type OpenOrigin, type Placement } from './placement.ts';
import type { Viewport } from '../sites/viewport.ts';

/** A pane a mod opened: what it asked for and whether it appears. */
export interface PaneInfo {
  readonly id: string;
  readonly plugin: string;
  readonly request: OpenRequest;
  readonly isPlaced: boolean;
}

/** Why a pane closes: its mod called `$.ui.close`, the person closed it, or the mod was unloaded (`ui.close`'s `e.origin.kind`). */
export const CLOSE_KINDS = ['plugin', 'person', 'unload'] as const;
export type CloseKind = (typeof CLOSE_KINDS)[number];

export interface PaneContext {
  readonly surface: Surface;
  readonly viewport: Viewport | undefined;
}

export interface PaneRegistryOptions {
  readonly chain: ModChain;
  readonly signal: AbortSignal;
  readonly report: (report: HookReport) => void;
}

export interface PaneRegistry {
  /** Opens (or reopens) a pane and says whether it appears. */
  open(plugin: string, request: OpenRequest, origin: OpenOrigin, context: PaneContext): Placement;
  /** Removes a pane: the effect of a close. Whether it existed. */
  remove(id: string): boolean;
  /** Closes a pane the person closed or a mod's unload left: fires `ui.close` with `origin.kind`, then removes it unless a hook kept it. */
  close(id: string, kind: Exclude<CloseKind, 'plugin'>): Promise<boolean>;
  /** Closes every pane of `plugin`, as an unload does. */
  unload(plugin: string): Promise<void>;
  list(): readonly PaneInfo[];
  /** The window was measured or resized: the panes that wait and now fit, as the ids that appear. */
  resize(context: PaneContext): readonly string[];
  /** Whether a pane that is placed asked to hold toasts. */
  holdsToasts(): boolean;
}

export function createPaneRegistry(options: PaneRegistryOptions): PaneRegistry {
  const panes = new Map<string, PaneInfo>();
  /** Panes the user opened once themselves: "After the user has opened that pane once themselves, 110 columns is enough". */
  const userOpened = new Set<string>();
  const place = (id: string, origin: OpenOrigin, context: PaneContext): Placement =>
    placePane({ origin, ...context, hasUserOpened: userOpened.has(id) });
  const remove = (id: string): boolean => panes.delete(id);
  const close = async (id: string, kind: Exclude<CloseKind, 'plugin'>): Promise<boolean> => {
    if (!panes.has(id)) return false;
    await options.chain.dispatch(
      'ui.close',
      { id, origin: { kind } },
      {
        origin: ENGINE_ORIGIN,
        signal: options.signal,
        report: options.report,
        core: (e) => Promise.resolve(remove(id) && e),
      },
    );
    return !panes.has(id);
  };
  return {
    open(plugin, request, origin, context) {
      const placement = place(request.id, origin, context);
      if (origin === 'user') userOpened.add(request.id);
      panes.set(request.id, { id: request.id, plugin, request, isPlaced: placement.isPlaced });
      return placement;
    },
    remove,
    close,
    async unload(plugin) {
      for (const pane of panes.values()) if (pane.plugin === plugin) await close(pane.id, 'unload');
    },
    list: () => [...panes.values()],
    resize(context) {
      const appeared: string[] = [];
      for (const pane of panes.values()) {
        if (pane.isPlaced || !place(pane.id, 'mod', context).isPlaced) continue;
        panes.set(pane.id, { ...pane, isPlaced: true });
        appeared.push(pane.id);
      }
      return appeared;
    },
    holdsToasts: () => [...panes.values()].some((pane) => pane.isPlaced && pane.request.holdToasts),
  };
}
