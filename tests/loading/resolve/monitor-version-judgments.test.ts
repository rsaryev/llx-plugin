/** Host-version input judgments, not compatibility claims (spec/judgments.md). */
import { expect, test } from 'bun:test';
import { monitorsToStart } from '../../../src/loading/resolve/monitor-trigger.ts';
import { readMonitors } from '../../../src/format/monitors.ts';

test('an unknown host version with flag fetching disabled cannot establish the minimum', () => {
  const monitors = readMonitors(
    [{ name: 'log', command: 'tail -F x', description: 'Log' }],
    'monitors.json',
  ).monitors;
  for (const version of ['', 'unknown', '2.1.310junk', 'v2.1.319']) {
    expect(
      monitorsToStart(monitors, { kind: 'session-start' }, new Set(), {
        interactive: true,
        featureFlagsAvailable: false,
        version,
      }),
    ).toEqual([]);
  }
  expect(
    monitorsToStart(monitors, { kind: 'session-start' }, new Set(), {
      interactive: true,
      featureFlagsAvailable: false,
    }),
  ).toEqual([]);
});
