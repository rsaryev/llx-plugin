/**
 * hooks.md § Hook handler fields: "If you define the same handler in more than one settings file,
 * it runs once. A plugin's or skill's copy of the same handler stays separate." No requirement id
 * covers it; what "the same handler" means is a row in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { dedupeSettingsHandlers } from '../../../src/hooks/select/dedupe.ts';
import {
  command,
  entry,
  FACTS,
  pluginSource,
  projectSettings,
  select,
  settingsSource,
  skillSource,
} from '../../support/hooks-select.ts';

describe('the same handler in several settings files runs once', () => {
  test('user and project settings both declare it: one run', () => {
    const user = entry('PreToolUse', { matcher: 'Bash', source: settingsSource });
    const project = entry('PreToolUse', { matcher: 'Bash', source: projectSettings });
    expect(select([user, project], 'PreToolUse', FACTS.PreToolUse).selected).toEqual([user]);
  });

  test('the same fields in another order are the same handler', () => {
    const first = entry('PreToolUse', {
      handler: { type: 'command', command: './a.sh', timeout: 5 },
    });
    const second = entry('PreToolUse', {
      source: projectSettings,
      handler: { timeout: 5, command: './a.sh', type: 'command' },
    });
    expect(dedupeSettingsHandlers([first, second])).toEqual([first]);
  });

  test('a different command, field value or event is another handler', () => {
    const base = entry('PreToolUse', { handler: command('./a.sh') });
    const other = entry('PreToolUse', { source: projectSettings, handler: command('./b.sh') });
    const timed = entry('PreToolUse', {
      source: projectSettings,
      handler: { ...command('./a.sh'), timeout: 5 },
    });
    expect(dedupeSettingsHandlers([base, other, timed])).toEqual([base, other, timed]);
  });
});

describe("a plugin's or skill's copy stays separate", () => {
  test('settings, plugin and skill copies of one handler all run', () => {
    const copies = [
      entry('PreToolUse', { source: settingsSource }),
      entry('PreToolUse', { source: pluginSource() }),
      entry('PreToolUse', { source: skillSource }),
    ];
    expect(select(copies, 'PreToolUse', FACTS.PreToolUse).selected).toEqual(copies);
  });

  test('two plugins that ship the same handler each keep theirs', () => {
    const copies = [
      entry('PreToolUse', { source: pluginSource('one') }),
      entry('PreToolUse', { source: pluginSource('two') }),
    ];
    expect(dedupeSettingsHandlers(copies)).toEqual(copies);
  });
});

describe('judgment: the same matcher text is part of the identity', () => {
  test('one handler under two matchers is two handlers', () => {
    const edit = entry('PreToolUse', { matcher: 'Edit' });
    const write = entry('PreToolUse', { matcher: 'Write', source: projectSettings });
    expect(dedupeSettingsHandlers([edit, write])).toEqual([edit, write]);
  });
});
