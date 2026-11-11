import { MOD_LIMITS } from '../../../protocol/mods-limits.ts';
import { nameProblem } from '../../api/names.ts';
import type { Renderer } from '../toast.ts';
import { isRecord } from '../../../protocol/is-record.ts';

/**
 * Rows `$.ui.place` put in the transcript (plugins/mods/interface.md, "Place a row in the
 * transcript"; reference.md, "Limits"). The kit keeps which rows each mod has and answers the call;
 * the host draws each row at the `Placed` site with its `requestId` and says when one goes away.
 */

/** What `$.ui.place` resolves to: `{ isPlaced: true, requestId }`, or `isPlaced: false` with why. */
export type PlaceResult =
  | { readonly isPlaced: true; readonly requestId: string }
  | { readonly isPlaced: false; readonly reason: string };

export interface PlacedRow {
  /** What the `Placed` site's `e.requestId` is for this row. */
  readonly requestId: string;
  /** The name the mod gave the row: `e.props.id` at the site. */
  readonly id: string;
  /** The mod that placed it: `e.props.plugin` at the site. */
  readonly plugin: string;
}

/** The docs' example reason, for a call no attached surface draws. */
const NO_PLACED_SURFACE = 'no attached surface draws placed rows yet';
/** The reason at the limit, as reference.md "Limits" quotes it. */
const PLACED_LIMIT_REASON = `a plugin holds at most ${MOD_LIMITS.placedRows} placed rows`;

/** Whether the rows stay when the conversation is compacted: only fullscreen rendering keeps them. */
const KEEPS_ROWS_ON_COMPACT: { readonly [R in Renderer]: boolean } = {
  classic: false,
  fullscreen: true,
};

export interface PlacedRows {
  /** `$.ui.place({ id })` of `plugin`; `isDrawn` is whether an attached surface draws placed rows. */
  place(plugin: string, id: string, isDrawn: boolean): PlaceResult;
  /** The rows in the transcript, oldest first. */
  list(): readonly PlacedRow[];
  /** The user rewound past these rows (the host knows where each one sits): they go. The rows that went. */
  rewind(requestIds: readonly string[]): readonly PlacedRow[];
  /** The conversation was compacted: outside fullscreen rendering every row goes. The rows that went. */
  compact(renderer: Renderer): readonly PlacedRow[];
  /** The conversation ended: every row goes. The rows that went. */
  end(): readonly PlacedRow[];
}

/**
 * The `id` of a `$.ui.place` call, or an error that starts `ui.place:`: 1 to 64 letters, digits,
 * `_` or `-` (the wording is the kit's, as for `ui.open`).
 */
export function parsePlace(value: unknown): { readonly id: string } {
  const id = isRecord(value) ? value.id : undefined;
  const problem = nameProblem('placed row', id);
  if (problem !== undefined || typeof id !== 'string') {
    throw new Error(`ui.place: ${problem ?? 'takes an object with an id'}`);
  }
  return { id };
}

export function createPlacedRows(): PlacedRows {
  /** By `requestId`, oldest first; a `requestId` is never given twice. */
  const rows = new Map<string, PlacedRow>();
  let placed = 0;
  const all = (): PlacedRow[] => [...rows.values()];
  const drop = (gone: readonly PlacedRow[]): readonly PlacedRow[] => {
    for (const row of gone) rows.delete(row.requestId);
    return gone;
  };
  return {
    place(plugin, id, isDrawn) {
      const own = all().filter((row) => row.plugin === plugin);
      const held = own.find((row) => row.id === id);
      if (held !== undefined) return { isPlaced: true, requestId: held.requestId };
      if (!isDrawn) return { isPlaced: false, reason: NO_PLACED_SURFACE };
      if (own.length >= MOD_LIMITS.placedRows) {
        return { isPlaced: false, reason: PLACED_LIMIT_REASON };
      }
      placed += 1;
      const requestId = `placed-${placed}`;
      rows.set(requestId, { requestId, id, plugin });
      return { isPlaced: true, requestId };
    },
    list: all,
    rewind: (requestIds) => drop(all().filter((row) => requestIds.includes(row.requestId))),
    compact: (renderer) => drop(KEEPS_ROWS_ON_COMPACT[renderer] ? [] : all()),
    end: () => drop(all()),
  };
}
