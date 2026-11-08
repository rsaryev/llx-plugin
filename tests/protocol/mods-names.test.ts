/**
 * The names and numbers the mods reference gives as tables (plugins/mods/reference.md § Events,
 * § Mods API methods, § Limits, § The hook function). The lists are copied from the page, so a
 * change to the page that `bun run docs:pull` brings in shows up as a failing comparison here.
 */
import { describe, expect, test } from 'bun:test';
import { MODS_API } from '../../src/protocol/mods-api-names.ts';
import {
  API_EVENT_NAMES,
  CLASSIC_EVENT_NAMES,
  MOD_EVENT_GROUPS,
  MOD_EVENT_NAMES,
  MOD_TIERS,
  STREAM_EVENTS,
  TELEMETRY_EVENTS,
  WILDCARDS,
} from '../../src/protocol/mods-events.ts';
import { HOOK_EVENTS } from '../../src/protocol/hook-events.ts';
import { MOD_LIMITS, MOD_NAME_PATTERN } from '../../src/protocol/mods-limits.ts';

describe('the events of the reference', () => {
  test('48 events, by group, each named once', () => {
    expect(
      Object.fromEntries(
        Object.entries(MOD_EVENT_GROUPS).map(([group, names]) => [group, names.length]),
      ),
    ).toEqual({
      tools: 3,
      prompts: 12,
      commands: 5,
      turns: 3,
      session: 9,
      subagents: 2,
      interface: 10,
      mods: 2,
      telemetry: 2,
    });
    expect(MOD_EVENT_NAMES).toHaveLength(48);
    expect(new Set(MOD_EVENT_NAMES).size).toBe(48);
  });
  test('every settings hook event is an event named classic.<Event>', () => {
    expect(CLASSIC_EVENT_NAMES.map(String)).toEqual(HOOK_EVENTS.map((event) => `classic.${event}`));
    expect(CLASSIC_EVENT_NAMES).toContain('classic.Stop');
    expect(CLASSIC_EVENT_NAMES).toContain('classic.PostToolUse');
  });
  test('every mods API method is an event named <namespace>.<method>', () => {
    expect(API_EVENT_NAMES).toContain('fs.read');
    expect(API_EVENT_NAMES).toContain('model.complete');
    expect(API_EVENT_NAMES).toContain('ui.open');
    expect(API_EVENT_NAMES).toHaveLength(Object.values(MODS_API).flat().length);
  });
  test('the wildcards, the streaming events, the telemetry events and the tiers', () => {
    expect(WILDCARDS).toEqual(['classic.*', '*']);
    expect(STREAM_EVENTS).toEqual(['turn.step', 'process.spawn']);
    expect(TELEMETRY_EVENTS).toEqual(['telemetry.log', 'telemetry.mark']);
    expect(MOD_TIERS).toEqual(['prepend', 'user', 'append', 'builtin', 'core']);
  });
});

describe('the mods API table', () => {
  test('21 namespaces with the methods the reference lists', () => {
    expect(Object.keys(MODS_API)).toEqual([
      'plugin',
      'ui',
      'command',
      'tool',
      'agent',
      'model',
      'prompt',
      'turn',
      'session',
      'config',
      'settings',
      'env',
      'fs',
      'store',
      'state',
      'clock',
      'http',
      'process',
      'mcp',
      'audio',
      'telemetry',
    ]);
    expect(MODS_API.fs).toEqual(['read', 'write', 'list', 'exists', 'stat', 'ancestors']);
    expect(MODS_API.clock).toEqual(['now', 'sleep', 'after', 'every']);
    expect(MODS_API.ui).toHaveLength(16);
    expect(MODS_API.session).toHaveLength(14);
  });
});

describe('the Limits table', () => {
  test('the numbers, as written on the page', () => {
    expect(MOD_LIMITS).toMatchObject({
      hookMs: 10_000,
      promptEditMs: 50,
      catchMs: 1000,
      sessionEndMs: 1500,
      runTimeoutMs: 30_000,
      runTimeoutMaxMs: 600_000,
      outputBytes: 4_194_304,
      maxTokens: 1024,
      maxTokensCap: 64_000,
      fileBytes: 4_194_304,
      httpRequestChars: 4_194_304,
      httpResponseBytes: 4_194_304,
      httpMs: 30_000,
      redirects: 5,
      reasonChars: 4096,
      treeText: 100_000,
      fieldChars: 10_000,
      hrefChars: 2048,
      treeDepth: 32,
      treeNodes: 20_000,
      rasterCells: 262_144,
      imageBytes: 2_097_152,
      storeBytes: 4_194_304,
      messages: 4096,
      toastMs: 4000,
      invalidatePerSecond: 10,
      invalidatePerSecondTerminal: 30,
      paneColumns: 144,
      paneColumnsAfterOpen: 110,
      nameChars: 64,
      scopes: 2000,
      nesting: 28_000,
      testMs: 5000,
    });
  });
  test('names are letters, digits, _ and -, up to 64 characters', () => {
    expect(MOD_NAME_PATTERN.test('my-mod_2')).toBe(true);
    expect(MOD_NAME_PATTERN.test('a'.repeat(64))).toBe(true);
    expect(MOD_NAME_PATTERN.test('a'.repeat(65))).toBe(false);
    expect(MOD_NAME_PATTERN.test('has space')).toBe(false);
    expect(MOD_NAME_PATTERN.test('')).toBe(false);
  });
});
