/**
 * Host-version input judgments, not compatibility claims (spec/judgments.md): with flag fetching
 * off, a monitor starts from v2.1.310 on, the release read by `format/versions` (a leading `v`
 * and text after the number tolerated, a pre-release before its release).
 */
import { expect, test } from 'bun:test';
import { monitorsToStart } from '../../../src/loading/resolve/monitor-trigger.ts';
import { readMonitors } from '../../../src/format/monitors.ts';

const monitors = readMonitors(
  [{ name: 'log', command: 'tail -F x', description: 'Log' }],
  'monitors.json',
).monitors;

const started = (version?: string): readonly string[] =>
  monitorsToStart(monitors, { kind: 'session-start' }, new Set(), {
    interactive: true,
    featureFlagsAvailable: false,
    ...(version === undefined ? {} : { version }),
  }).map((monitor) => monitor.name);

test('an unknown host version with flag fetching disabled cannot establish the minimum', () => {
  for (const version of [undefined, '', 'unknown']) expect(started(version)).toEqual([]);
});

test('a release before 2.1.310, or a pre-release of it, does not start a monitor', () => {
  for (const version of ['2.1.309', '2.1.310-beta.1']) expect(started(version)).toEqual([]);
});

test('2.1.310 and later start it, written with a v, a pre-release suffix or trailing text', () => {
  for (const version of ['2.1.310', 'v2.1.319', '2.1.320-beta', '2.1.310 (Claude Code)']) {
    expect(started(version)).toEqual(['log']);
  }
});
