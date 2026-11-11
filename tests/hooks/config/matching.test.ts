/**
 * hooks.md § "Match MCP tools" (`mcp__<server>__<tool>` names, the required `.*`, the scoped
 * `mcp__plugin_<plugin>_<server>__<tool>` name of a plugin's server, the tool events that carry them),
 * § "Match Monitor commands" (a `Bash` matcher also runs on Monitor commands but its `allow` and
 * `updatedInput` have no effect; a matcher that includes Monitor gets the call itself) and § "How
 * `if` patterns match Bash commands" (the five-row table, leading assignments stripped, "When Claude
 * Code can't determine which commands the Bash input runs, it runs your hook regardless of the
 * pattern"). Asserted through the hook engine's select stage and, for the Monitor effects, through a
 * dispatch over the real output stage.
 */
import { describe, expect, test } from 'bun:test';
import type { HookEvent } from '../../../src/protocol/official.ts';
import { command, entry, FACTS, select } from '../../support/hooks-select.ts';
import { engineSession } from '../../support/hooks-session.ts';
import { spec } from '../../support/spec.ts';

const TOOL_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'PermissionDenied',
] as const satisfies readonly HookEvent[];

/** Whether a hook with `matcher` runs for a call of `tool` on `event`. */
function fires(event: (typeof TOOL_EVENTS)[number], matcher: string | undefined, tool: string) {
  const hook = entry(event, matcher === undefined ? {} : { matcher });
  return select([hook], event, { ...FACTS[event], tool_name: tool }).selected.length === 1;
}

spec('hooks.behavior.Match MCP tools', () => {
  test('MCP tools appear in the tool events, so a matcher names them like any tool', () => {
    for (const event of TOOL_EVENTS) {
      expect(fires(event, 'mcp__memory__create_entities', 'mcp__memory__create_entities')).toBe(
        true,
      );
      expect(fires(event, 'mcp__memory__create_entities', 'mcp__memory__search')).toBe(false);
    }
  });

  test('.* after the server prefix matches every tool of the server', () => {
    for (const tool of ['mcp__memory__create_entities', 'mcp__memory__search_nodes']) {
      expect(fires('PreToolUse', 'mcp__memory__.*', tool)).toBe(true);
    }
    expect(fires('PreToolUse', 'mcp__memory__.*', 'mcp__filesystem__read_file')).toBe(false);
    expect(fires('PreToolUse', 'mcp__memory__.*', 'Bash')).toBe(false);
  });

  test('without .* a server prefix has only exact-match characters, is compared as an exact string and matches no tool', () => {
    expect(fires('PreToolUse', 'mcp__memory', 'mcp__memory__create_entities')).toBe(false);
    expect(fires('PreToolUse', 'mcp__brave-search', 'mcp__brave-search__brave_web_search')).toBe(
      false,
    );
    expect(fires('PreToolUse', 'mcp__memory', 'mcp__memory')).toBe(true);
  });

  test('a server whose name contains a hyphen is matched with .*', () => {
    expect(
      fires('PostToolUse', 'mcp__brave-search__.*', 'mcp__brave-search__brave_web_search'),
    ).toBe(true);
  });

  test('mcp__.*__write.* matches a tool starting with write from any server', () => {
    expect(fires('PreToolUse', 'mcp__.*__write.*', 'mcp__filesystem__write_file')).toBe(true);
    expect(fires('PreToolUse', 'mcp__.*__write.*', 'mcp__memory__write_entities')).toBe(true);
    expect(fires('PreToolUse', 'mcp__.*__write.*', 'mcp__filesystem__read_file')).toBe(false);
  });

  test('a plugin-bundled server has the scoped name mcp__plugin_<plugin>_<server>__<tool>', () => {
    const scoped = 'mcp__plugin_my-plugin_db__query';
    expect(fires('PreToolUse', 'mcp__plugin_my-plugin_db__.*', scoped)).toBe(true);
  });

  test('a matcher written against the bare server key never fires for those tools', () => {
    const scoped = 'mcp__plugin_my-plugin_db__query';
    expect(fires('PreToolUse', 'mcp__db__.*', scoped)).toBe(false);
    expect(fires('PreToolUse', 'mcp__db__query', scoped)).toBe(false);
  });

  test("the same scoped tool name is used in a handler's if field", () => {
    const scoped = 'mcp__plugin_my-plugin_db__query';
    const hook = entry('PreToolUse', { handler: { ...command(), if: scoped } });
    const facts = (tool: string) => ({ ...FACTS.PreToolUse, tool_name: tool });
    expect(select([hook], 'PreToolUse', facts(scoped)).selected).toHaveLength(1);
    expect(select([hook], 'PreToolUse', facts('mcp__db__query')).selected).toHaveLength(0);
  });
});

const MONITOR = {
  ...FACTS.PreToolUse,
  tool_name: 'Monitor',
  tool_input: { description: 'tail', timeout_ms: 1000, command: 'tail -f app.log' },
};
const WEBSOCKET = {
  ...MONITOR,
  tool_input: { description: 'ws', timeout_ms: 1000, ws: { url: 'wss://x.test/feed' } },
};

const answer = (fields: object) =>
  JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', ...fields } });

/** A Monitor call dispatched to one hook, which prints `printed`. */
async function dispatchMonitor(matcher: string | undefined, printed: string, ifRule?: string) {
  const hook = entry('PreToolUse', {
    ...(matcher === undefined ? {} : { matcher }),
    handler: { ...command(), ...(ifRule === undefined ? {} : { if: ifRule }) },
  });
  const run = engineSession([hook], [{ stdout: printed }]);
  const outcome = await run.fire('PreToolUse', { facts: MONITOR });
  const sent = run.runner.calls[0]?.stdin;
  return { outcome, sent: typeof sent === 'string' ? JSON.parse(sent) : undefined };
}

spec('hooks.behavior.Match Monitor commands', () => {
  test('a Bash matcher also runs on a Monitor command, which the hook gets as a Bash call', async () => {
    const { sent, outcome } = await dispatchMonitor('Bash', '');
    expect(outcome.runs).toHaveLength(1);
    expect(sent?.tool_name).toBe('Bash');
  });

  test('Bash|PowerShell, ^Bash$ and Bash.* are Bash matchers too', async () => {
    for (const matcher of ['Bash|PowerShell', '^Bash$', 'Bash.*']) {
      expect((await dispatchMonitor(matcher, '')).outcome.runs).toHaveLength(1);
    }
  });

  test('under a Bash matcher its allow and updatedInput have no effect on the Monitor command', async () => {
    const { outcome } = await dispatchMonitor(
      'Bash',
      answer({ permissionDecision: 'allow', updatedInput: { command: 'tail -f other.log' } }),
    );
    expect(outcome.effects.permissionDecision).toBeUndefined();
    expect(outcome.effects.updatedInput).toBeUndefined();
  });

  test('a hook that runs for a Monitor command can still deny it or have Claude Code ask', async () => {
    const denied = await dispatchMonitor(
      'Bash',
      answer({ permissionDecision: 'deny', permissionDecisionReason: 'no tailing' }),
    );
    expect(denied.outcome.proceed).toBe(false);
    const asked = await dispatchMonitor('Bash', answer({ permissionDecision: 'ask' }));
    expect(asked.outcome.effects.permissionDecision).toBe('ask');
  });

  test('a matcher that includes Monitor gets the Monitor call itself, and allow and updatedInput apply', async () => {
    for (const matcher of ['Bash|Monitor', '.*', undefined]) {
      const { sent, outcome } = await dispatchMonitor(
        matcher,
        answer({ permissionDecision: 'allow', updatedInput: { command: 'tail -f other.log' } }),
      );
      expect(sent?.tool_name).toBe('Monitor');
      expect(outcome.effects.permissionDecision).toBe('allow');
      expect(outcome.effects.updatedInput).toEqual({ command: 'tail -f other.log' });
    }
  });

  test('in if, Monitor(tail *) matches by the rules Bash(tail *) follows', async () => {
    expect((await dispatchMonitor('Monitor', '', 'Monitor(tail *)')).outcome.runs).toHaveLength(1);
    expect((await dispatchMonitor('Monitor', '', 'Monitor(npm *)')).outcome.runs).toHaveLength(0);
  });

  test('with a Bash matcher the hook names Bash in if, and does not run if its if names Monitor', async () => {
    expect((await dispatchMonitor('Bash', '', 'Bash(tail *)')).outcome.runs).toHaveLength(1);
    expect((await dispatchMonitor('Bash', '', 'Monitor(tail *)')).outcome.runs).toHaveLength(0);
  });

  test('if its if names Bash while the matcher includes Monitor, the hook gets the Monitor input but allow and updatedInput have no effect', async () => {
    const { sent, outcome } = await dispatchMonitor(
      'Monitor',
      answer({ permissionDecision: 'allow' }),
      'Bash(tail *)',
    );
    expect(sent?.tool_name).toBe('Monitor');
    expect(outcome.effects.permissionDecision).toBeUndefined();
  });

  test('a Bash matcher does not run for a WebSocket watch, and a PostToolUse hook with one does not run for Monitor', () => {
    const preHook = entry('PreToolUse', { matcher: 'Bash' });
    expect(select([preHook], 'PreToolUse', WEBSOCKET).selected).toHaveLength(0);
    const postHook = entry('PostToolUse', { matcher: 'Bash' });
    expect(
      select([postHook], 'PostToolUse', { ...FACTS.PostToolUse, tool_name: 'Monitor' }).selected,
    ).toHaveLength(0);
  });
});

/** Whether `ifRule` lets a hook run for a Bash call of `text`. */
function ifRuns(ifRule: string, text: string): boolean {
  const hook = entry('PreToolUse', { handler: { ...command(), if: ifRule } });
  const facts = { ...FACTS.PreToolUse, tool_input: { command: text } };
  return select([hook], 'PreToolUse', facts).selected.length === 1;
}

describe('the Bash table', () => {
  spec('hooks.behavior.How if patterns match Bash commands', () => {
    test('leading VAR=value assignments are stripped before matching: Bash(git *) runs for FOO=bar git push', () => {
      expect(ifRuns('Bash(git *)', 'FOO=bar git push')).toBe(true);
    });

    test('each subcommand is checked: Bash(git *) runs for npm test && git push', () => {
      expect(ifRuns('Bash(git *)', 'npm test && git push')).toBe(true);
      expect(ifRuns('Bash(git *)', 'npm test && npm run build')).toBe(false);
    });

    test('commands inside $() and backticks are checked: Bash(rm *) runs for echo $(rm -rf /)', () => {
      expect(ifRuns('Bash(rm *)', 'echo $(rm -rf /)')).toBe(true);
      expect(ifRuns('Bash(rm *)', 'echo `rm -rf /`')).toBe(true);
    });

    test('Bash(rm *) does not run for echo $(date): no subcommand matches rm *', () => {
      expect(ifRuns('Bash(rm *)', 'echo $(date)')).toBe(false);
    });

    test('a pattern that specifies more than the command name runs the hook anyway on $(), backticks or $VAR', () => {
      expect(ifRuns('Bash(git push *)', 'echo $(date)')).toBe(true);
      expect(ifRuns('Bash(git push *)', 'echo `date`')).toBe(true);
      expect(ifRuns('Bash(git push *)', 'echo $HOME')).toBe(true);
    });

    test('when Claude Code cannot determine which commands the input runs, the hook runs regardless of the pattern', () => {
      expect(ifRuns('Bash(rm *)', 'echo "unterminated')).toBe(true);
    });

    test('without an if every handler of the matched group runs', () => {
      const plain = entry('PreToolUse');
      expect(select([plain], 'PreToolUse', FACTS.PreToolUse).selected).toHaveLength(1);
    });
  });
});
