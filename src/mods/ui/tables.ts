import { ENGINE_ORIGIN } from '../../protocol/mods-events.ts';
import {
  RENDER_SITE_NAMES,
  UI_SURFACES,
  type RenderSite,
  type UiSurface,
} from '../../protocol/mods-ui-names.ts';
import { defaultElementTable, type ElementTable } from './elements/table.ts';
import { isElementName } from './elements/node.ts';
import type { HookReport, ModChain } from '../types.ts';
import { isRecord } from '../../protocol/is-record.ts';

const keyOf = (plugin: string, surface: UiSurface, site: RenderSite): string =>
  JSON.stringify([plugin, surface, site]);

/** The element table of each (mod, app, render site), as `ui.resolve` left it. */
export interface ElementTables {
  get(plugin: string, surface: UiSurface, site: RenderSite): ElementTable | undefined;
  set(plugin: string, surface: UiSurface, site: RenderSite, table: ElementTable): void;
  /** Forgets a mod's tables when it unloads. */
  remove(plugin: string): void;
}

export function createElementTables(): ElementTables {
  const tables = new Map<string, ElementTable>();
  return {
    get: (plugin, surface, site) => tables.get(keyOf(plugin, surface, site)),
    set: (plugin, surface, site, table) => void tables.set(keyOf(plugin, surface, site), table),
    remove(plugin) {
      for (const key of tables.keys()) if (key.startsWith(`["${plugin}",`)) tables.delete(key);
    },
  };
}

/** Why an answer of a `ui.resolve` hook is not an element table, or `undefined`: a record of element functions. */
export function tableProblem(result: unknown): string | undefined {
  if (!isRecord(result))
    return 'ui.resolve result: an element table is a record of element functions';
  const bad = Object.entries(result).find(
    ([name, member]) => !isElementName(name) || typeof member !== 'function',
  );
  return bad ? `ui.resolve result: "${bad[0]}" is not an element function` : undefined;
}

const isElementTable = (value: unknown): value is ElementTable => tableProblem(value) === undefined;

export interface ResolveOptions {
  readonly chain: ModChain;
  readonly tables: ElementTables;
  readonly signal: AbortSignal;
  readonly report: (report: HookReport) => void;
}

/**
 * Fires `ui.resolve` for one mod, once for each app and render site, as mods load (reference.md,
 * "Interface"): the hooks answer with the element table `$.ui.resolve(e)` then reads, and Claude
 * Code's own answer is the elements the app draws. Judgment: the event carries `{ plugin, surface,
 * component }`, the docs name the three axes and no field.
 */
export async function resolveTables(options: ResolveOptions, plugin: string): Promise<void> {
  for (const surface of UI_SURFACES) {
    for (const site of RENDER_SITE_NAMES) {
      const answer = await options.chain.dispatch(
        'ui.resolve',
        { plugin, surface, component: site },
        {
          origin: ENGINE_ORIGIN,
          signal: options.signal,
          report: options.report,
          core: () => Promise.resolve(defaultElementTable(surface)),
        },
      );
      if (isElementTable(answer)) options.tables.set(plugin, surface, site, answer);
    }
  }
}
