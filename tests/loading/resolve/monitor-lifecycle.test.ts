/** plugins/components.md § Monitors: minimum version, interactive sessions and disabling mid-session. */
import { expect, test } from 'bun:test';
import { monitorsToStart, monitorsToStop } from '../../../src/loading/resolve/index.ts';
import { readMonitors } from '../../../src/format/monitors.ts';
import { spec } from '../../support/spec.ts';

const monitors = readMonitors(
  [{ name: 'log', command: 'tail -F app.log', description: 'Errors' }],
  'monitors.json',
).monitors;
const event = { kind: 'session-start' } as const;

spec('monitors.components.Monitors.Minimum version', () => {
  test('without feature-flag fetching, requires 2.1.310 even in an interactive session', () => {
    for (const version of ['2.1.0', '2.1.309']) {
      expect(
        monitorsToStart(monitors, event, new Set(), {
          interactive: true,
          featureFlagsAvailable: false,
          version,
        }),
      ).toEqual([]);
    }
    for (const version of ['2.1.310', '2.1.319', '2.2.0', '3.0.0']) {
      expect(
        monitorsToStart(monitors, event, new Set(), {
          interactive: true,
          featureFlagsAvailable: false,
          version,
        }),
      ).toEqual(monitors);
    }
    expect(
      monitorsToStart(monitors, event, new Set(), {
        interactive: true,
        featureFlagsAvailable: true,
        version: '2.1.309',
      }),
    ).toEqual(monitors);
  });
});

spec('monitors.components.Monitors.Interactive sessions', () => {
  test('a supported version still never starts monitors in -p mode', () => {
    expect(
      monitorsToStart(monitors, event, new Set(), {
        interactive: false,
        featureFlagsAvailable: false,
        version: '2.1.319',
      }),
    ).toEqual([]);
  });
});

spec('monitors.components.Monitors.Disabling mid-session', () => {
  test('disabling leaves running monitors alone; session end stops them', () => {
    const started = new Set(['log', 'deploy']);
    expect(monitorsToStop(started, 'plugin-disabled')).toEqual([]);
    expect(monitorsToStop(started, 'session-ended')).toEqual(['log', 'deploy']);
    expect(
      monitorsToStart(monitors, { kind: 'plugin-reload' }, started, { interactive: true }),
    ).toEqual([]);
  });
});
