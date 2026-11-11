/**
 * The patterns `on` takes and `next.is` tests, declarations 2.1.321 (AGENTS.md, E2a):
 * - `Glob` (claude-code/index.d.ts:5346): "Every event (`*`), or every event under a namespace
 *   (`classic.*` ...). But a telemetry event, which is hooked by name (`telemetry.log`, or
 *   `telemetry.*` for all): `*` does not select one for an installed plugin."
 * - `Namespace` (:6893): every dotted prefix of an event's name.
 * - `Negation` (:6955): "`!` before a name or a glob: every event except the ones it selects. `!*`
 *   would select none, so it is no pattern. It names no event, so like `*` it selects no telemetry
 *   event for an installed plugin."
 * - `Selected` (:11516): what each pattern selects.
 */
import { describe, expect, test } from 'bun:test';
import { selects } from '../../../src/mods/chain/select.ts';
import { lacksTelemetryFilter } from '../../../src/mods/chain/validate.ts';
import { isOnName } from '../../../src/mods/chain/wildcard.ts';
import { fn, harness } from '../../support/mods-chain.ts';

describe('selects: what a pattern selects', () => {
  test('`*` selects every event but a telemetry one', () => {
    expect(selects('*', 'tool.call')).toBe(true);
    expect(selects('*', 'classic.Stop')).toBe(true);
    expect(selects('*', 'telemetry.log')).toBe(false);
  });

  test('`ns.*` selects every event under the namespace, telemetry ones by their own namespace', () => {
    expect(selects('ui.*', 'ui.render')).toBe(true);
    expect(selects('ui.*', 'tool.call')).toBe(false);
    expect(selects('classic.*', 'classic.Stop')).toBe(true);
    expect(selects('telemetry.*', 'telemetry.log')).toBe(true);
  });

  test('`!x` selects every event x does not, and no telemetry event', () => {
    expect(selects('!tool.call', 'tool.call')).toBe(false);
    expect(selects('!tool.call', 'tool.check')).toBe(true);
    expect(selects('!ui.*', 'ui.render')).toBe(false);
    expect(selects('!ui.*', 'tool.call')).toBe(true);
    expect(selects('!tool.call', 'telemetry.log')).toBe(false);
  });
});

describe('isOnName: the patterns on takes', () => {
  test('a name, `*`, a glob over a namespace, and a negation of a name or a glob', () => {
    for (const pattern of ['tool.call', '*', 'classic.*', 'tool.*', 'ui.*', 'telemetry.*']) {
      expect(isOnName(pattern)).toBe(true);
    }
    for (const pattern of ['!tool.call', '!classic.*', '!ui.*'])
      expect(isOnName(pattern)).toBe(true);
  });

  test('not `!*`, a glob over no namespace, a negation of no event, nor an unknown name', () => {
    for (const pattern of ['!*', 'bogus.*', 'tool.call.*', '!bogus', '!!tool.call', 'tool.calls']) {
      expect(isOnName(pattern)).toBe(false);
    }
  });
});

describe('a hook registered on a glob or a negation', () => {
  test('runs on each event it selects and on no other', async () => {
    const h = harness();
    const seen: string[] = [];
    const watch = (pattern: string) =>
      fn(pattern, (_$, e, next) => (seen.push(`${pattern} ${next.event}`), next(e)));
    h.mod('globs', 'user', [watch('tool.*'), watch('!tool.call'), watch('!ui.*')]);
    await h.fire('tool.call', {});
    await h.fire('tool.check', {});
    await h.fire('ui.toast', { text: 'x' });
    expect(seen).toEqual([
      'tool.* tool.call',
      '!ui.* tool.call',
      'tool.* tool.check',
      '!tool.call tool.check',
      '!ui.* tool.check',
      '!tool.call ui.toast',
    ]);
  });

  test('a hook on `telemetry.*` needs the telemetry filter, as one on a telemetry event does', () => {
    expect(lacksTelemetryFilter('telemetry.*', undefined)).toBe(true);
    expect(lacksTelemetryFilter('telemetry.*', { to: 'collector' })).toBe(false);
    expect(lacksTelemetryFilter('*', undefined)).toBe(false);
  });
});
