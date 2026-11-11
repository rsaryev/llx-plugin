/**
 * `OFFICIAL_BUT_OFF`: "on for Anthropic's official marketplaces such as `claude-plugins-official`,
 * off for `knowledge-work-plugins` and `first-party-plugins`" (plugins/loading.md, "Which
 * marketplaces and plugins auto-update", item 3). One list, which both the registry's plan
 * (src/settings/marketplaces/registry.ts) and the update pass (src/updates/auto-update-precedence.ts) read.
 */
import { expect, test } from 'bun:test';
import { OFFICIAL_NAMES } from '../../../src/format/marketplace/index.ts';
import {
  isOfficialButOff,
  OFFICIAL_BUT_OFF,
} from '../../../src/format/marketplace/marketplace-name-lists.ts';

test('the two official names whose auto-update default is off, each an official name', () => {
  expect([...OFFICIAL_BUT_OFF]).toEqual(['knowledge-work-plugins', 'first-party-plugins']);
  const official: readonly string[] = OFFICIAL_NAMES;
  expect(OFFICIAL_BUT_OFF.filter((name) => !official.includes(name))).toEqual([]);
  expect(isOfficialButOff('first-party-plugins')).toBe(true);
  expect(isOfficialButOff('claude-plugins-official')).toBe(false);
});
