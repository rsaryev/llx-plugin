/**
 * hooks.md § Matcher patterns ("Each event type matches on a different field", the nine events with
 * "no matcher support", the narrower set of `FileChanged` and `StopFailure`) and § Match MCP tools.
 * One `spec(hooks.matcher.<Event>)` per event: the matcher is tested against the field the docs name
 * for it, or ignored where the event has no matcher support. The grammar itself (match-all, lists,
 * regular expressions) is proven in tests/rules/hook-matcher.test.ts; here it is shown to apply to
 * the right field of each event.
 */
import { describe, expect, test } from 'bun:test';
import { HOOK_EVENTS } from '../../../src/protocol/hook-events.ts';
import type { HookEvent } from '../../../src/protocol/official.ts';
import { mcpToolName, pluginMcpServerName } from '../../../src/rules/index.ts';
import { spec } from '../../support/spec.ts';
import { command, entry, FACTS, select } from '../../support/hooks-select.ts';

/** The events that filter on a field, with a value `FACTS` holds and a different one the docs list. */
const FILTERED: Partial<Record<HookEvent, { readonly value: string; readonly other: string }>> = {
  PreToolUse: { value: 'Bash', other: 'Edit' },
  PostToolUse: { value: 'Edit', other: 'Bash' },
  PostToolUseFailure: { value: 'Bash', other: 'Write' },
  PermissionRequest: { value: 'Bash', other: 'Read' },
  PermissionDenied: { value: 'Bash', other: 'Read' },
  SessionStart: { value: 'startup', other: 'resume' },
  Setup: { value: 'init', other: 'maintenance' },
  SessionEnd: { value: 'other', other: 'logout' },
  Notification: { value: 'idle_prompt', other: 'permission_prompt' },
  SubagentStart: { value: 'Explore', other: 'Plan' },
  SubagentStop: { value: 'Explore', other: 'Plan' },
  PreCompact: { value: 'manual', other: 'auto' },
  PostCompact: { value: 'manual', other: 'auto' },
  PreModelSwitch: { value: 'claude-opus-5', other: 'claude-opus-4-6' },
  PostModelSwitch: { value: 'claude-opus-5', other: 'claude-opus-4-6' },
  ConfigChange: { value: 'user_settings', other: 'project_settings' },
  DirectoryAdded: { value: 'slash_command', other: 'register_repo_root' },
  FileChanged: { value: '.envrc', other: 'data.csv' },
  StopFailure: { value: 'rate_limit', other: 'overloaded' },
  InstructionsLoaded: { value: 'session_start', other: 'include' },
  UserPromptExpansion: { value: 'review', other: 'deploy' },
  Elicitation: { value: 'issue-tracker', other: 'memory' },
  ElicitationResult: { value: 'issue-tracker', other: 'memory' },
};

/** A catalog that knows the model the sample facts switch to. */
const catalog = { canonicalModel: (id: string) => (id === 'claude-opus-5' ? id : undefined) };

const selects = (event: HookEvent, matcher: string): boolean => {
  const registered = entry(event, { matcher });
  const result = select([registered], event, FACTS[event], { catalog });
  return result.selected.length === 1;
};

for (const event of HOOK_EVENTS) {
  const field = FILTERED[event];
  spec([`hooks.matcher.${event}`, 'hooks.guide.Filter hooks with matchers'], () => {
    if (field === undefined) {
      test('has no matcher support: a matcher is silently ignored and the hook always fires', () => {
        expect(selects(event, 'something-that-matches-nothing')).toBe(true);
        expect(selects(event, '^never$')).toBe(true);
      });
      return;
    }
    test('a matcher naming the value selects it, one naming another value does not', () => {
      expect(selects(event, field.value)).toBe(true);
      expect(selects(event, field.other)).toBe(false);
    });
    test('a list and a regular expression apply to the same field', () => {
      expect(selects(event, `${field.other}|${field.value}`)).toBe(true);
      expect(selects(event, `^${field.value}$`)).toBe(true);
      expect(selects(event, `^${field.other}$`)).toBe(false);
    });
    test('match-all: omitted, "" and "*" fire on every occurrence', () => {
      const registered = [
        entry(event, { handler: command('./a.sh') }),
        entry(event, { matcher: '', handler: command('./b.sh') }),
        entry(event, { matcher: '*', handler: command('./c.sh') }),
      ];
      const result = select(registered, event, FACTS[event], { catalog });
      expect(result.selected).toEqual(registered);
    });
  });
}

describe('tool events match the tool name', () => {
  const toolEvents = [
    'PreToolUse',
    'PostToolUse',
    'PostToolUseFailure',
    'PermissionRequest',
    'PermissionDenied',
  ] as const;
  const runs = (event: (typeof toolEvents)[number], matcher: string, toolName: string) =>
    select([entry(event, { matcher })], event, { ...FACTS[event], tool_name: toolName }).selected
      .length === 1;

  test('`Edit|Write` and `Edit, Write` each match either tool exactly; `Edit.*` also NotebookEdit', () => {
    for (const event of toolEvents) {
      expect(runs(event, 'Edit|Write', 'Write')).toBe(true);
      expect(runs(event, 'Edit, Write', 'Edit')).toBe(true);
      expect(runs(event, 'Edit|Write', 'NotebookEdit')).toBe(false);
      expect(runs(event, 'Edit.*', 'NotebookEdit')).toBe(true);
    }
  });

  test('`mcp__memory__.*` matches every tool of the memory server; `mcp__memory` matches none', () => {
    for (const event of toolEvents) {
      expect(runs(event, 'mcp__memory__.*', 'mcp__memory__create_entities')).toBe(true);
      expect(runs(event, 'mcp__memory', 'mcp__memory__create_entities')).toBe(false);
      expect(runs(event, 'mcp__brave-search', 'mcp__brave-search__search')).toBe(false);
      expect(runs(event, 'mcp__brave-search__.*', 'mcp__brave-search__search')).toBe(true);
    }
  });

  test('`mcp__.*__write.*` matches a tool starting with write from any server', () => {
    expect(runs('PreToolUse', 'mcp__.*__write.*', 'mcp__filesystem__write_file')).toBe(true);
    expect(runs('PreToolUse', 'mcp__.*__write.*', 'mcp__filesystem__read_file')).toBe(false);
  });

  test('a plugin-bundled server uses the scoped name: the bare server key never fires', () => {
    const tool = mcpToolName(pluginMcpServerName('my-plugin', 'db'), 'query');
    expect(tool).toBe('mcp__plugin_my-plugin_db__query');
    expect(runs('PreToolUse', 'mcp__plugin_my-plugin_db__.*', tool)).toBe(true);
    expect(runs('PreToolUse', 'mcp__db__.*', tool)).toBe(false);
  });
});

const changed = (matcher: string, file: string) =>
  select([entry('FileChanged', { matcher })], 'FileChanged', {
    file_path: file,
    event: 'change',
  }).selected.length === 1;

describe('FileChanged filters on the changed file basename, and builds the watch list from the matcher', () => {
  test('`.envrc|.env` selects either file by basename, in any directory', () => {
    expect(changed('.envrc|.env', '/work/app/.env')).toBe(true);
    expect(changed('.envrc|.env', '/work/app/sub/.envrc')).toBe(true);
    expect(changed('.envrc|.env', '/work/app/other')).toBe(false);
  });

  test('a hyphen, space or comma keeps the matcher on the regular-expression path: only `|` separates', () => {
    expect(changed('data.csv, notes.txt', '/work/app/notes.txt')).toBe(false);
    expect(changed('data.csv|notes.txt', '/work/app/notes.txt')).toBe(true);
    // `my-fil` is no exact name of `my-file`: it matches only as an unanchored regular expression.
    expect(changed('my-fil', '/work/app/my-file')).toBe(true);
  });
});

const failed = (matcher: string, error: 'rate_limit' | 'overloaded') =>
  select([entry('StopFailure', { matcher })], 'StopFailure', { error }).selected.length === 1;

describe('StopFailure uses the narrower exact-match set', () => {
  test('`|` separates alternatives; a comma or space sends the matcher to the regular expression path', () => {
    expect(failed('rate_limit|overloaded', 'overloaded')).toBe(true);
    expect(failed('rate_limit, overloaded', 'overloaded')).toBe(false);
  });

  test('other events with matcher support accept `|` or `,`', () => {
    const notified = select(
      [entry('Notification', { matcher: 'permission_prompt, idle_prompt' })],
      'Notification',
      FACTS.Notification,
    );
    expect(notified.selected).toHaveLength(1);
  });
});

describe('SubagentStart and SubagentStop match the agent type', () => {
  test('a plugin-scoped agent type is on the regular-expression path: anchor it', () => {
    const facts = { ...FACTS.SubagentStart, agent_type: 'my-plugin:reviewer' };
    const runs = (matcher: string) =>
      select([entry('SubagentStart', { matcher })], 'SubagentStart', facts).selected.length === 1;
    expect(runs('^my-plugin:reviewer$')).toBe(true);
    // The colon is outside the exact set, so `my-plugin:review` is a regular expression, tested unanchored.
    expect(runs('my-plugin:review')).toBe(true);
    expect(runs('^reviewer$')).toBe(false);
    expect(runs('reviewer')).toBe(false);
  });

  test('a matcher that names agent types does not match an empty agent_type', () => {
    const facts = { ...FACTS.SubagentStop, agent_type: '' };
    const runs = (matcher?: string) =>
      select(
        [entry('SubagentStop', matcher === undefined ? {} : { matcher })],
        'SubagentStop',
        facts,
      ).selected.length === 1;
    expect(runs('code-reviewer')).toBe(false);
    expect(runs('Explore|Plan')).toBe(false);
  });

  test('an omitted, "" or "*" matcher, or a regular expression matching "", runs for an empty agent_type', () => {
    const facts = { ...FACTS.SubagentStop, agent_type: '' };
    const runs = (matcher?: string) =>
      select(
        [entry('SubagentStop', matcher === undefined ? {} : { matcher })],
        'SubagentStop',
        facts,
      ).selected.length === 1;
    for (const matcher of [undefined, '', '*', '^$', '.*']) expect(runs(matcher)).toBe(true);
  });
});

const switched = (event: 'PreModelSwitch' | 'PostModelSwitch', matcher: string, to: string) =>
  select(
    [entry(event, { matcher })],
    event,
    { ...FACTS[event], to_model: to },
    {
      catalog: {
        canonicalModel: (id) =>
          ({ opus: 'claude-opus-5', 'claude-opus-5-20260101': 'claude-opus-5' })[id],
      },
    },
  ).selected.length === 1;

describe('PreModelSwitch and PostModelSwitch match the canonical model name', () => {
  test('an alias, a dated id and the canonical name all match the one canonical name', () => {
    for (const event of ['PreModelSwitch', 'PostModelSwitch'] as const) {
      for (const to of ['opus', 'claude-opus-5-20260101', 'claude-opus-5']) {
        expect(switched(event, 'claude-opus-5', to)).toBe(true);
      }
    }
  });

  test('a `|` list and a regular expression such as `.*opus.*` are read against it', () => {
    expect(switched('PreModelSwitch', 'claude-opus-4-6|claude-opus-5', 'opus')).toBe(true);
    expect(switched('PreModelSwitch', '.*opus.*', 'opus')).toBe(true);
    expect(switched('PreModelSwitch', 'claude-opus-4-6', 'opus')).toBe(false);
  });

  test('a [1m] suffix is ignored', () => {
    expect(switched('PostModelSwitch', 'claude-opus-5', 'opus[1m]')).toBe(true);
  });

  test('with no canonical name every hook runs, whatever its matcher', () => {
    expect(switched('PreModelSwitch', 'claude-opus-4-6', 'my-gateway-model')).toBe(true);
    const withoutCatalog = select(
      [entry('PreModelSwitch', { matcher: 'claude-opus-4-6' })],
      'PreModelSwitch',
      FACTS.PreModelSwitch,
    );
    expect(withoutCatalog.selected).toHaveLength(1);
  });
});
