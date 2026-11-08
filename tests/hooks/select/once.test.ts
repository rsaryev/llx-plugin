/**
 * hooks.md § Common fields (`once`): "If `true`, Claude Code removes the hook after its first
 * successful run. A run that fails, blocks with exit code 2, or times out leaves the hook in place,
 * so it runs again on the next matching event. Only honored for hooks declared in skill frontmatter;
 * ignored in settings files and agent frontmatter"; § Hooks in skills and agents ("To have Claude
 * Code remove a hook after its first successful run instead, set `once: true`").
 */
import { describe, expect, test } from 'bun:test';
import { consumedByRun } from '../../../src/hooks/select/once.ts';
import { spec } from '../../support/spec.ts';
import {
  agentSource,
  command,
  entry,
  pluginSource,
  settingsSource,
  skillSource,
} from '../../support/hooks-select.ts';

const once = { ...command(), once: true };
const declared = (source: typeof skillSource) => entry('PreToolUse', { source, handler: once });

spec('hooks.handler.common.once', () => {
  test('a skill-frontmatter hook with once: true is removed after its first successful run', () => {
    expect(consumedByRun(declared(skillSource), true)).toBe(true);
  });

  test('a run that fails, blocks with exit code 2 or times out leaves the hook in place', () => {
    expect(consumedByRun(declared(skillSource), false)).toBe(false);
  });

  test('without once, or with once: false, the hook stays after a successful run', () => {
    expect(consumedByRun(entry('PreToolUse', { source: skillSource }), true)).toBe(false);
    const never = { ...command(), once: false };
    expect(consumedByRun(entry('PreToolUse', { source: skillSource, handler: never }), true)).toBe(
      false,
    );
  });

  test('it is ignored in settings files and agent frontmatter', () => {
    expect(consumedByRun(declared(settingsSource), true)).toBe(false);
    expect(consumedByRun(declared(agentSource), true)).toBe(false);
  });
});

describe('judgment: no other source honors once', () => {
  test('a plugin hooks file and a session registration keep the hook after a successful run', () => {
    expect(consumedByRun(declared(pluginSource()), true)).toBe(false);
    expect(consumedByRun(declared({ kind: 'session', label: '[session]' }), true)).toBe(false);
  });
});
