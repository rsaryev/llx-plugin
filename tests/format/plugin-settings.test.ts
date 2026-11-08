/**
 * plugins/components.md § Default settings ("Two keys take effect, `agent` and `subagentStatusLine`, and
 * every other key is dropped"); plugins/manifest-reference.md § `settings` ("Only `agent` and
 * `subagentStatusLine` take effect; other keys are dropped at load"), § Standard layout (Settings:
 * "`agent` and `subagentStatusLine` defaults applied while the plugin is enabled"); settings-reference.md
 * § subagentStatusLine ("object with `type` set to `"command"` and a `command` string").
 *
 * Applying the defaults (the lowest settings layer) is the host's; these tests prove which keys the kit
 * hands over.
 */
import { describe, expect, test } from 'bun:test';
import { hasAppliedSettings, readPluginSettings } from '../../src/index.ts';
import { spec } from '../support/spec.ts';

spec(['layout.Settings', 'manifest.field.settings'], () => {
  test('agent and subagentStatusLine are the two keys that take effect', () => {
    const read = readPluginSettings(
      { agent: 'security-reviewer', subagentStatusLine: { type: 'command', command: 'jq .tasks' } },
      'settings.json',
    );
    expect(read.settings).toEqual({
      agent: 'security-reviewer',
      subagentStatusLine: { type: 'command', command: 'jq .tasks' },
    });
    expect(read.issues).toEqual([]);
  });

  test('every other key is dropped, each with a warning naming it', () => {
    const read = readPluginSettings(
      { agent: 'reviewer', model: 'opus', permissions: { allow: ['Bash'] }, env: { A: '1' } },
      'settings.json',
    );
    expect(read.settings).toEqual({ agent: 'reviewer' });
    expect(read.issues.map((found) => [found.severity, found.path])).toEqual([
      ['warning', 'settings.json.model'],
      ['warning', 'settings.json.permissions'],
      ['warning', 'settings.json.env'],
    ]);
  });

  test('a file with no supported key applies nothing', () => {
    const read = readPluginSettings({ model: 'opus' }, 'settings.json');
    expect(read.settings).toEqual({});
    expect(hasAppliedSettings(read)).toBe(false);
    expect(hasAppliedSettings(readPluginSettings({ agent: 'a' }, 'settings.json'))).toBe(true);
  });
});

describe('settings values (judgments)', () => {
  test('a supported key with a value of the wrong shape is dropped with a warning', () => {
    const read = readPluginSettings(
      { agent: 3, subagentStatusLine: { type: 'script', command: 'x' } },
      'settings',
    );
    expect(read.settings).toEqual({});
    expect(read.issues.map((found) => found.severity)).toEqual(['warning', 'warning']);
  });

  test('settings that are not an object are an error naming where they came from', () => {
    for (const raw of [null, [], 'agent']) {
      const read = readPluginSettings(raw, 'settings.json');
      expect(read.settings).toEqual({});
      expect(read.issues).toEqual([
        {
          severity: 'error',
          path: 'settings.json',
          message: 'settings.json must be a JSON object of settings',
        },
      ]);
    }
  });
});
