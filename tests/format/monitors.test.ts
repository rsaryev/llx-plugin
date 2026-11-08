/**
 * plugins/manifest-reference.md § monitors (the field table: `name`, `command`, `description`,
 * `when`; "Each entry is a strict object"), § Unrecognized fields ("An unknown key is an error, and
 * the plugin doesn't load"); plugins/components.md § Monitors (the `monitors/monitors.json` array
 * and the `experimental.monitors` inline form).
 *
 * `readMonitors` is the file or inline-array reader: what a field means at run time (when a monitor
 * starts, what its command resolves to) is proven in tests/loading/resolve/.
 */
import { describe, expect, test } from 'bun:test';
import { blocksLoading, parseMonitorTrigger, readMonitors } from '../../src/index.ts';
import { spec } from '../support/spec.ts';

const FILE = 'monitors/monitors.json';
const errorLog = {
  name: 'error-log',
  command: 'tail -F ./logs/error.log',
  description: 'Application error log',
};

/** The one entry of a read that must be valid. */
const only = (raw: unknown) => {
  const read = readMonitors(raw, FILE);
  expect(read.issues).toEqual([]);
  return read.monitors;
};

describe('every monitors entry (not tied to one field)', () => {
  test('an entry is a strict object: an unknown key is an error that keeps the plugin from loading', () => {
    const read = readMonitors([{ ...errorLog, restart: true }], FILE);
    expect(read.monitors).toEqual([]);
    expect(read.issues).toHaveLength(1);
    expect(read.issues[0]?.message).toContain('restart');
    expect(blocksLoading(read.issues)).toBe(true);
  });

  test('an entry that is not an object is an error', () => {
    for (const entry of ['tail -F x', 3, null, ['error-log']]) {
      const read = readMonitors([entry], FILE);
      expect(read.monitors).toEqual([]);
      expect(blocksLoading(read.issues)).toBe(true);
    }
  });

  test('the source is the monitors array: anything else is an error, an empty array is no monitor', () => {
    for (const raw of [{ monitors: [errorLog] }, 'monitors', null, errorLog]) {
      const read = readMonitors(raw, FILE);
      expect(read.monitors).toEqual([]);
      expect(blocksLoading(read.issues)).toBe(true);
    }
    expect(readMonitors([], FILE)).toEqual({ monitors: [], issues: [] });
  });

  test('an issue names the file and the position of the entry, so a plugin author finds it', () => {
    const read = readMonitors([errorLog, { name: 'x' }], 'plugin.json experimental.monitors');
    expect(read.issues.map((issue) => issue.path)).toEqual([
      'plugin.json experimental.monitors[1]',
    ]);
  });
});

spec('monitors.field.name', () => {
  test('is required, and a string', () => {
    const { name: _, ...withoutName } = errorLog;
    for (const entry of [withoutName, { ...errorLog, name: 7 }, { ...errorLog, name: '' }]) {
      const read = readMonitors([entry], FILE);
      expect(read.monitors).toEqual([]);
      expect(read.issues[0]?.message).toContain('name');
    }
  });

  test('is unique within the plugin: a second monitor of a name is an error and the first keeps it', () => {
    const read = readMonitors([errorLog, { ...errorLog, command: 'tail -F other.log' }], FILE);
    expect(read.monitors).toEqual([{ ...errorLog, when: { kind: 'always' } }]);
    expect(read.issues).toHaveLength(1);
    expect(read.issues[0]?.message).toContain('"error-log"');
    expect(read.issues[0]?.message).toContain('unique');
    expect(blocksLoading(read.issues)).toBe(true);
  });

  test('the name of an entry is kept as declared (the components.md example)', () => {
    expect(only([errorLog])[0]?.name).toBe('error-log');
  });

  test('distinct names are all kept, in file order', () => {
    const names = only([errorLog, { ...errorLog, name: 'access-log' }]).map((each) => each.name);
    expect(names).toEqual(['error-log', 'access-log']);
  });
});

spec('monitors.field.command', () => {
  test('is required, and a string', () => {
    const { command: _, ...withoutCommand } = errorLog;
    for (const entry of [
      withoutCommand,
      { ...errorLog, command: ['tail'] },
      { ...errorLog, command: '' },
    ]) {
      const read = readMonitors([entry], FILE);
      expect(read.monitors).toEqual([]);
      expect(read.issues[0]?.message).toContain('command');
    }
  });

  test('is read as written: the shell line is not split, trimmed or substituted by the reader', () => {
    const line = '"${CLAUDE_PLUGIN_ROOT}"/scripts/poll-deploy.sh --watch | grep -v ok';
    expect(only([{ ...errorLog, command: line }])[0]?.command).toBe(line);
  });
});

spec('monitors.field.description', () => {
  test('is required, and a string', () => {
    const { description: _, ...withoutDescription } = errorLog;
    for (const entry of [
      withoutDescription,
      { ...errorLog, description: 1 },
      { ...errorLog, description: '' },
    ]) {
      const read = readMonitors([entry], FILE);
      expect(read.monitors).toEqual([]);
      expect(read.issues[0]?.message).toContain('description');
    }
  });

  test('is kept as declared', () => {
    expect(only([errorLog])[0]?.description).toBe('Application error log');
  });
});

spec('monitors.field.when', () => {
  const deploy = {
    name: 'deploy-status',
    command: '"${CLAUDE_PLUGIN_ROOT}"/scripts/poll-deploy.sh',
    description: 'Deployment status changes',
  };

  test('"always" is the trigger of a monitor that names it, as it is of one that omits `when`', () => {
    expect(only([{ ...errorLog, when: 'always' }])[0]?.when).toEqual({ kind: 'always' });
    expect(only([errorLog])[0]?.when).toEqual({ kind: 'always' });
  });

  test('"on-skill-invoke:<skill>" (the manifest-reference example) names the skill that starts it', () => {
    const [monitor] = only([{ ...deploy, when: 'on-skill-invoke:deploy' }]);
    expect(monitor?.when).toEqual({ kind: 'on-skill-invoke', skill: 'deploy' });
  });

  test('any other value is an error naming the two documented forms', () => {
    for (const when of [
      'never',
      'on-skill-invoke',
      'on-skill-invoke:',
      'ALWAYS',
      'on-session-start',
      '',
    ]) {
      const read = readMonitors([{ ...deploy, when }], FILE);
      expect(read.monitors).toEqual([]);
      expect(read.issues).toHaveLength(1);
      expect(read.issues[0]?.message).toContain('"always"');
      expect(read.issues[0]?.message).toContain('"on-skill-invoke:<skill>"');
      expect(blocksLoading(read.issues)).toBe(true);
    }
  });

  test('a `when` that is not a string is an error', () => {
    for (const when of [true, 5, null, ['always'], { kind: 'always' }]) {
      const read = readMonitors([{ ...deploy, when }], FILE);
      expect(read.monitors).toEqual([]);
      expect(read.issues[0]?.message).toContain('when');
    }
  });
});

describe('judgments (spec/judgments.md)', () => {
  test('the skill after the colon is kept as written: a qualified name, spaces or case are not folded', () => {
    expect(parseMonitorTrigger('on-skill-invoke:ops:Deploy Now')).toEqual({
      kind: 'on-skill-invoke',
      skill: 'ops:Deploy Now',
    });
  });

  test('valid entries are returned beside the issues of the invalid ones', () => {
    const read = readMonitors(
      [errorLog, { name: 'bad' }, { ...errorLog, name: 'access-log' }],
      FILE,
    );
    expect(read.monitors.map((each) => each.name)).toEqual(['error-log', 'access-log']);
    expect(read.issues).toHaveLength(1);
  });

  test('an empty name, command or description counts as missing', () => {
    expect(readMonitors([{ ...errorLog, name: '' }], FILE).monitors).toEqual([]);
  });
});
