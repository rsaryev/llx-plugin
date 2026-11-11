/**
 * The names and numbers the mods reference gives as tables (plugins/mods/reference.md § Events,
 * § Mods API methods, § Limits), compared with the constants. The tables are the committed
 * snapshot (`tests/support/mods-reference.ts`); `check:spec` compares it with the pulled page, so a
 * change to the page shows up there, and the `mods.event.*` requirement ids are the events.
 */
import { describe, expect, test } from 'bun:test';
import {
  DECLARED_API_MEMBERS,
  MODS_API,
  MODS_API_REFERENCE,
} from '../../src/protocol/mods-api-names.ts';
import {
  API_EVENT_NAMES,
  CLASSIC_EVENT_NAMES,
  MOD_EVENT_GROUPS,
  MOD_EVENT_NAMES,
  MOD_TIERS,
  STREAM_EVENTS,
  TELEMETRY_EVENTS,
  WILDCARDS,
  type ModEventGroup,
} from '../../src/protocol/mods-events.ts';
import { HOOK_EVENTS } from '../../src/protocol/hook-events.ts';
import { MOD_LIMITS, MOD_NAME_PATTERN } from '../../src/protocol/mods-limits.ts';
import { MODS_REFERENCE } from '../support/mods-reference.ts';
import { requirementKeys } from '../support/requirements.ts';

/** The headings of § Events that hold event tables, and the group of the kit each one is. */
const EVENT_HEADINGS: Readonly<Record<string, ModEventGroup>> = {
  Tools: 'tools',
  'Prompts and what Claude reads': 'prompts',
  'Commands and configuration': 'commands',
  Turns: 'turns',
  Session: 'session',
  Subagents: 'subagents',
  Interface: 'interface',
  'Other mods': 'mods',
  Telemetry: 'telemetry',
};

describe('the events of the reference', () => {
  test('the events of each group of the page, in its order, are the events of the kit', () => {
    const groups = MODS_REFERENCE.events;
    expect(groups.map((section) => section.group)).toEqual(Object.keys(EVENT_HEADINGS));
    for (const section of groups) {
      const group = EVENT_HEADINGS[section.group];
      expect(group).toBeDefined();
      if (group) expect(MOD_EVENT_GROUPS[group].map(String)).toEqual(section.events);
    }
    expect(MOD_EVENT_NAMES).toHaveLength(48);
    expect(new Set(MOD_EVENT_NAMES).size).toBe(48);
    expect(MOD_EVENT_NAMES.map(String)).toEqual(groups.flatMap((section) => section.events));
  });
  test('the mods.event.* requirements are the events of the kit', () => {
    const events = requirementKeys('mods.event.').filter((key) => !key.endsWith('*'));
    expect(events.toSorted()).toEqual(MOD_EVENT_NAMES.map(String).toSorted());
  });
  test('every settings hook event is an event named classic.<Event>', () => {
    expect(CLASSIC_EVENT_NAMES.map(String)).toEqual(HOOK_EVENTS.map((event) => `classic.${event}`));
    expect(CLASSIC_EVENT_NAMES).toContain('classic.Stop');
    expect(CLASSIC_EVENT_NAMES).toContain('classic.PostToolUse');
  });
  test('every mods API method is an event named <namespace>.<method>, and the two values of $.plugin are not (judgment)', () => {
    expect(API_EVENT_NAMES).toContain('fs.read');
    expect(API_EVENT_NAMES).toContain('model.complete');
    expect(API_EVENT_NAMES).toContain('ui.open');
    expect(API_EVENT_NAMES).not.toContain('plugin.name');
    expect(API_EVENT_NAMES).not.toContain('plugin.root');
    // `$.prompt.media` is "The engine's own read, no event" (claude-code/index.d.ts:3137).
    expect(API_EVENT_NAMES).not.toContain('prompt.media');
    expect(API_EVENT_NAMES).toHaveLength(Object.values(MODS_API).flat().length - 3);
  });
  test('the wildcards, the streaming events, the telemetry events and the tiers', () => {
    expect(WILDCARDS).toEqual(['classic.*', '*']);
    expect(STREAM_EVENTS).toEqual(['turn.step', 'process.spawn']);
    expect(TELEMETRY_EVENTS).toEqual(['telemetry.log', 'telemetry.mark']);
    expect(MOD_TIERS).toEqual(['prepend', 'user', 'append', 'builtin', 'core']);
  });
});

describe('the mods API table', () => {
  test('every namespace of the page has exactly the methods the kit lists, in the page order', () => {
    const documented = MODS_REFERENCE.apiMethods.map((row) => [row.namespace, row.methods]);
    expect(Object.keys(MODS_API)).toHaveLength(22);
    expect(documented).toEqual(
      Object.entries(MODS_API_REFERENCE).map(([name, methods]) => [name, [...methods]]),
    );
  });
  test("the kit's table is the page's, each namespace followed by the members only the declarations name", () => {
    expect(Object.entries(MODS_API).map(([name, methods]) => [name, [...methods]])).toEqual(
      Object.entries(MODS_API_REFERENCE).map(([name, methods]) => [
        name,
        [...methods, ...(Reflect.get(DECLARED_API_MEMBERS, name) ?? [])],
      ]),
    );
  });
});

/** The units a Limits value is written in, as a multiplier into the constant's own unit. */
const UNITS: Readonly<Record<string, number>> = {
  second: 1000,
  seconds: 1000,
  minutes: 60_000,
  MiB: 1024 * 1024,
};

/** `10 seconds` is 10000, `4 MiB` is 4194304, `4,096 characters` is 4096. */
function amount(written: string): number {
  const match = /^([\d,.]+)\s*(\w+)?/.exec(written);
  const unit = match?.[2];
  return (
    Number(match?.[1]?.replaceAll(',', '')) * ((unit === undefined ? undefined : UNITS[unit]) ?? 1)
  );
}

/**
 * The constants the Limits table has no row for, each with the value its declaration gives
 * (AGENTS.md, E2a): claude-code/index.d.ts:5435, `HookBudget`, `readonly lingerMs: 5_000`.
 */
const DECLARED_ONLY = { lingerMs: 5000 } as const;
type TableLimit = Exclude<keyof typeof MOD_LIMITS, keyof typeof DECLARED_ONLY>;

/** Each constant of `MOD_LIMITS` the table holds: part of the row's first cell, and the value as the page writes it. */
const LIMIT_ROWS: Readonly<Record<TableLimit, readonly [string, string]>> = {
  hookMs: ["A hook's own execution time", '10 seconds'],
  promptEditMs: ["A hook's own execution time", '50 milliseconds'],
  catchMs: ['`.catch` handler', '1 second'],
  sessionEndMs: ['All `session.end` hooks together', '1.5 seconds'],
  runTimeoutMs: ['`$.process.run` timeout', '30 seconds'],
  runTimeoutMaxMs: ['`$.process.run` timeout', '10 minutes'],
  outputBytes: ['`stdout` and `stderr`', '4 MiB'],
  maxTokens: ['`maxTokens`', '1024'],
  maxTokensCap: ['`maxTokens`', '64,000'],
  fileBytes: ['`$.fs.read` and `$.fs.write`', '4 MiB'],
  httpRequestChars: ['request body', '4 MiB'],
  httpResponseBytes: ['response body', '4 MiB'],
  httpMs: ['One `$.http.fetch` call', '30 seconds'],
  redirects: ['Redirects one', '5'],
  reasonChars: ['`drop` reason', '4,096'],
  treeText: ['Text in one tree', '100,000'],
  fieldChars: ["A `Code`'s `language`", '10,000'],
  hrefChars: ["A `Link`'s `href`", '2,048'],
  treeDepth: ['Nesting depth of one tree', '32'],
  treeNodes: ['Elements and text children', '20,000'],
  rasterCells: ['`Raster` cells', '262,144'],
  imageBytes: ['PNG or RGBA', '2 MiB'],
  storeBytes: ['`$.store`', '4 MiB'],
  messages: ['`$.session.messages()`', '4,096'],
  toastMs: ['`$.ui.toast`', '4 seconds'],
  invalidatePerSecond: ["`$.ui.invalidate('ui.render')`", '10 a second'],
  invalidatePerSecondTerminal: ["`$.ui.invalidate('ui.render')`", '30 in the terminal'],
  paneColumns: ['A pane opened', '144 terminal columns'],
  paneColumnsAfterOpen: ['A pane opened', '110 after'],
  nameChars: ['Command, tool, subagent type', '64 characters'],
  placedRows: ['Rows from `$.ui.place`', '500'],
  scopes: ['Scopes, such as', '2,000'],
  nesting: ['Nesting depth of a mods', '28,000 levels'],
  testMs: ['`claude plugin test` test', '5 seconds'],
};

const isLimit = (key: string): key is TableLimit => key in MOD_LIMITS && !(key in DECLARED_ONLY);

describe('the Limits table', () => {
  const rows = MODS_REFERENCE.limits.map((row) => [row.limit, row.value]);
  const rowOf = (part: string) => rows.filter((cells) => cells[0]?.includes(part));

  test('every constant is the number the page writes in its row', () => {
    for (const key of Object.keys(MOD_LIMITS).filter(isLimit)) {
      const [part, written] = LIMIT_ROWS[key];
      const found = rowOf(part);
      expect(found, `${key}: one row names ${part}`).toHaveLength(1);
      expect(found[0]?.[1], `${key}: the row says ${written}`).toContain(written);
      expect(MOD_LIMITS[key], key).toBe(amount(written));
    }
  });
  test('every row of the page is held by a constant', () => {
    const held = new Set(Object.values(LIMIT_ROWS).flatMap(([part]) => rowOf(part)));
    // the nesting limit is one constant for the page's three rows about it
    const nesting = rows.filter((cells) => cells[0]?.startsWith('Nesting depth of a'));
    expect(nesting).toHaveLength(3);
    expect(Object.keys(LIMIT_ROWS).toSorted()).toEqual(
      Object.keys(MOD_LIMITS).filter(isLimit).toSorted(),
    );
    expect(rows.filter((cells) => !held.has(cells) && !nesting.includes(cells))).toEqual([]);
    expect(nesting.every((cells) => cells[1]?.startsWith('28,000 levels'))).toBe(true);
  });
  test('a constant with no row is the value its declaration gives', () => {
    expect(MOD_LIMITS.lingerMs).toBe(DECLARED_ONLY.lingerMs);
  });
  test('names are letters, digits, _ and -, up to 64 characters', () => {
    expect(MOD_NAME_PATTERN.test('my-mod_2')).toBe(true);
    expect(MOD_NAME_PATTERN.test('a'.repeat(64))).toBe(true);
    expect(MOD_NAME_PATTERN.test('a'.repeat(65))).toBe(false);
    expect(MOD_NAME_PATTERN.test('has space')).toBe(false);
    expect(MOD_NAME_PATTERN.test('')).toBe(false);
  });
});
