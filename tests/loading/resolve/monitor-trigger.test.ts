/**
 * plugins/manifest-reference.md § monitors (`when`: "With `"always"`, the default, the monitor starts
 * at session start and on plugin reload. With `"on-skill-invoke:<skill>"`, it starts the first time
 * that skill runs"); plugins/components.md § Monitors ("Interactive sessions: plugin monitors don't
 * start in non-interactive mode with the `-p` flag").
 *
 * The kit never spawns: `monitorsToStart` is the pure decision of which monitors an event starts,
 * given the names the host has started. Spawning, and remembering the set, are the host's.
 */
import { describe, expect, test } from 'bun:test';
import {
  monitorsToStart,
  skillTriggerNames,
  type MonitorEvent,
} from '../../../src/entry/loading.ts';
import { readMonitors, type Monitor } from '../../../src/entry/format.ts';
import { spec } from '../../support/spec.ts';

const INTERACTIVE = { interactive: true };
const HEADLESS = { interactive: false };

const SESSION_START: MonitorEvent = { kind: 'session-start' };
const RELOAD: MonitorEvent = { kind: 'plugin-reload' };
const skillRan = (skill: string): MonitorEvent => ({ kind: 'skill-invoked', skill });

/** The monitors as a plugin would write them, read through the real reader. */
const declared = (...entries: { name: string; when?: string }[]): Monitor[] => {
  const read = readMonitors(
    entries.map((entry) => ({ command: 'tail -F x', description: 'd', ...entry })),
    'monitors/monitors.json',
  );
  expect(read.issues).toEqual([]);
  return read.monitors;
};

const names = (monitors: readonly Monitor[]) => monitors.map((monitor) => monitor.name);
const none: ReadonlySet<string> = new Set();

spec('monitors.field.when', () => {
  const monitors = declared(
    { name: 'default' },
    { name: 'always', when: 'always' },
    { name: 'deploy-status', when: 'on-skill-invoke:deploy' },
  );

  test('"always" (and an omitted `when`) starts at session start', () => {
    expect(names(monitorsToStart(monitors, SESSION_START, none, INTERACTIVE))).toEqual([
      'default',
      'always',
    ]);
  });

  test('"always" starts on plugin reload', () => {
    expect(names(monitorsToStart(monitors, RELOAD, none, INTERACTIVE))).toEqual([
      'default',
      'always',
    ]);
  });

  test('"always" does not wait for a skill: a skill running starts no always monitor', () => {
    expect(
      names(monitorsToStart(declared({ name: 'a' }), skillRan('deploy'), none, INTERACTIVE)),
    ).toEqual([]);
  });

  test('"on-skill-invoke:<skill>" is not started by the session starting or by a reload', () => {
    const waiting = declared({ name: 'deploy-status', when: 'on-skill-invoke:deploy' });
    expect(monitorsToStart(waiting, SESSION_START, none, INTERACTIVE)).toEqual([]);
    expect(monitorsToStart(waiting, RELOAD, none, INTERACTIVE)).toEqual([]);
  });

  test('"on-skill-invoke:<skill>" starts when that skill runs, and only that monitor', () => {
    expect(names(monitorsToStart(monitors, skillRan('deploy'), none, INTERACTIVE))).toEqual([
      'deploy-status',
    ]);
  });

  test('another skill running starts nothing, and a skill name is not a prefix match', () => {
    for (const skill of ['review', 'deployment', 'deplo', 'Deploy', '']) {
      expect(monitorsToStart(monitors, skillRan(skill), none, INTERACTIVE)).toEqual([]);
    }
  });

  test('"the first time": once started, the same skill running again starts it no more', () => {
    const started = new Set(['deploy-status']);
    expect(monitorsToStart(monitors, skillRan('deploy'), started, INTERACTIVE)).toEqual([]);
  });

  test('several monitors waiting for one skill all start at its first run', () => {
    const waiting = declared(
      { name: 'one', when: 'on-skill-invoke:deploy' },
      { name: 'two', when: 'on-skill-invoke:deploy' },
      { name: 'three', when: 'on-skill-invoke:review' },
    );
    expect(names(monitorsToStart(waiting, skillRan('deploy'), none, INTERACTIVE))).toEqual([
      'one',
      'two',
    ]);
  });

  test('the whole lifecycle: always at start, the skill monitor at the first run, nothing at the second', () => {
    const started = new Set<string>();
    const step = (event: MonitorEvent) => {
      const starting = monitorsToStart(monitors, event, started, INTERACTIVE);
      for (const monitor of starting) started.add(monitor.name);
      return names(starting);
    };
    expect(step(SESSION_START)).toEqual(['default', 'always']);
    expect(step(skillRan('review'))).toEqual([]);
    expect(step(skillRan('deploy'))).toEqual(['deploy-status']);
    expect(step(skillRan('deploy'))).toEqual([]);
  });

  test("the monitor starts as read: the same objects come back, in the plugin's order", () => {
    expect(monitorsToStart(monitors, SESSION_START, none, INTERACTIVE)).toEqual(
      monitors.filter((monitor) => monitor.name !== 'deploy-status'),
    );
  });
});

describe('non-interactive mode (components.md, "Interactive sessions")', () => {
  // Cited under no requirement id: the sentence belongs to the components.md page, whose
  // requirements are not in the monitors.field.* set.
  const monitors = declared({ name: 'a' }, { name: 'b', when: 'on-skill-invoke:deploy' });

  test('nothing starts at session start, on reload or when a skill runs', () => {
    for (const event of [SESSION_START, RELOAD, skillRan('deploy')]) {
      expect(monitorsToStart(monitors, event, none, HEADLESS)).toEqual([]);
    }
  });

  test('the same events start monitors once the session is interactive', () => {
    expect(names(monitorsToStart(monitors, SESSION_START, none, INTERACTIVE))).toEqual(['a']);
  });
});

describe('judgments (spec/judgments.md)', () => {
  test('J-L10: a name the host has running is not started again, on reload either', () => {
    const monitors = declared({ name: 'a' }, { name: 'b' });
    expect(names(monitorsToStart(monitors, RELOAD, new Set(['a']), INTERACTIVE))).toEqual(['b']);
  });

  test('J-L10: a host that stopped a monitor takes its name out, and a reload starts it again', () => {
    const monitors = declared({ name: 'a' });
    expect(names(monitorsToStart(monitors, RELOAD, new Set(), INTERACTIVE))).toEqual(['a']);
  });

  test('J-L10: names of other plugins in the set never matter, only those of the monitors passed', () => {
    expect(
      monitorsToStart(declared({ name: 'a' }), SESSION_START, new Set(['zzz']), INTERACTIVE),
    ).toHaveLength(1);
  });

  test('J-L11: a skill of the plugin answers to each of its names, namespaced and without the namespace', () => {
    const skill = { pluginId: 'ops@acme', names: ['ops:deploy'] };
    expect(skillTriggerNames('ops@acme', skill)).toEqual(['ops:deploy', 'deploy']);
    const nested = { pluginId: 'ops@acme', names: ['ops:db:migrate', 'migrate'] };
    expect(skillTriggerNames('ops@acme', nested)).toEqual([
      'ops:db:migrate',
      'db:migrate',
      'migrate',
    ]);
  });

  test("J-L11: another plugin's skill, or a skill of no plugin, gives a monitor no name", () => {
    expect(
      skillTriggerNames('ops@acme', { pluginId: 'tools@acme', names: ['tools:deploy'] }),
    ).toEqual([]);
    expect(skillTriggerNames('ops@acme', { names: ['deploy'] })).toEqual([]);
  });

  test('J-L11: monitorsToStart compares the event skill exactly, so each of those names is its own event', () => {
    const monitors = declared({ name: 'a', when: 'on-skill-invoke:ops:deploy' });
    expect(monitorsToStart(monitors, skillRan('deploy'), none, INTERACTIVE)).toEqual([]);
    expect(names(monitorsToStart(monitors, skillRan('ops:deploy'), none, INTERACTIVE))).toEqual([
      'a',
    ]);
  });

  test('no monitors, no start', () => {
    expect(monitorsToStart([], SESSION_START, none, INTERACTIVE)).toEqual([]);
  });
});
