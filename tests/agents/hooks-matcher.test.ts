/**
 * hooks.md § Matcher patterns for the frontmatter hooks of an agent: `FileChanged` and `StopFailure`
 * "use a narrower exact-match set of letters, digits, `_`, and `|` only" (a hyphen, space or comma
 * keeps the matcher on the regular-expression path), and an event without matcher support fires on
 * every occurrence whatever its `matcher` says.
 */
import { expect, test } from 'bun:test';
import { readAgent } from '../../src/format/agent.ts';
import type { HookEvent } from '../../src/protocol/official.ts';
import { at, file, loaded } from '../support/agent-files.ts';
import { commands } from '../support/agent-hooks.ts';
import { spec } from '../support/spec.ts';

const isNoSupport = (event: string): event is keyof typeof NO_SUPPORT => event in NO_SUPPORT;

const withMatcher = (event: HookEvent, matcher: string) =>
  loaded(
    readAgent(
      file(
        `name: watcher\ndescription: Watcher\nhooks:\n  ${event}:\n    - matcher: "${matcher}"\n      hooks: [{ type: command, command: ./run.sh }]`,
      ),
      at('user'),
    ),
  );

spec('hooks.matcher.FileChanged', () => {
  test('a matcher with a dot is a regular expression, so .envrc|.env still selects both files', () => {
    const agent = withMatcher('FileChanged', '.envrc|.env');
    // `.` is outside the narrow exact set, so this is a regular expression: unanchored, `.` any char.
    expect(commands(agent, { event: 'FileChanged', matcherValue: '.envrc' })).toEqual(['./run.sh']);
    expect(commands(agent, { event: 'FileChanged', matcherValue: '.env' })).toEqual(['./run.sh']);
    expect(commands(agent, { event: 'FileChanged', matcherValue: 'config.json' })).toEqual([]);
  });

  test('letters, digits, _ and | only are exact names', () => {
    const agent = withMatcher('FileChanged', 'envrc|env_local');
    expect(commands(agent, { event: 'FileChanged', matcherValue: 'envrc' })).toEqual(['./run.sh']);
    expect(commands(agent, { event: 'FileChanged', matcherValue: 'env_local' })).toEqual([
      './run.sh',
    ]);
    expect(commands(agent, { event: 'FileChanged', matcherValue: 'my-envrc' })).toEqual([]);
    expect(commands(agent, { event: 'FileChanged', matcherValue: 'env' })).toEqual([]);
  });

  test('a hyphen keeps the matcher on the regular-expression path', () => {
    const agent = withMatcher('FileChanged', 'a-b');
    expect(commands(agent, { event: 'FileChanged', matcherValue: 'a-b' })).toEqual(['./run.sh']);
    expect(commands(agent, { event: 'FileChanged', matcherValue: 'xa-by' })).toEqual(['./run.sh']);
    expect(commands(agent, { event: 'FileChanged', matcherValue: 'a' })).toEqual([]);
  });

  test('a comma does not separate alternatives', () => {
    const agent = withMatcher('FileChanged', 'a,b');
    expect(commands(agent, { event: 'FileChanged', matcherValue: 'a' })).toEqual([]);
    expect(commands(agent, { event: 'FileChanged', matcherValue: 'a,b' })).toEqual(['./run.sh']);
  });
});

spec('hooks.matcher.StopFailure', () => {
  test('a hyphenated matcher is a regular expression, tested unanchored', () => {
    const agent = withMatcher('StopFailure', 'rate-limit');
    expect(commands(agent, { event: 'StopFailure', matcherValue: 'rate-limit' })).toEqual([
      './run.sh',
    ]);
    expect(commands(agent, { event: 'StopFailure', matcherValue: 'a rate-limit b' })).toEqual([
      './run.sh',
    ]);
    expect(commands(agent, { event: 'StopFailure', matcherValue: 'rate' })).toEqual([]);
  });

  test('| separates exact error names and a comma does not', () => {
    const agent = withMatcher('StopFailure', 'rate_limit|server_error');
    expect(commands(agent, { event: 'StopFailure', matcherValue: 'server_error' })).toEqual([
      './run.sh',
    ]);
    expect(commands(agent, { event: 'StopFailure', matcherValue: 'rate' })).toEqual([]);
    const comma = withMatcher('StopFailure', 'rate_limit,server_error');
    expect(commands(comma, { event: 'StopFailure', matcherValue: 'server_error' })).toEqual([]);
  });
});

/** Each event without matcher support, with its own requirement: one block each, not one for all. */
const NO_SUPPORT = {
  UserPromptSubmit: 'hooks.matcher.UserPromptSubmit',
  PostToolBatch: 'hooks.matcher.PostToolBatch',
  Stop: 'hooks.matcher.Stop',
  TeammateIdle: 'hooks.matcher.TeammateIdle',
  TaskCreated: 'hooks.matcher.TaskCreated',
  TaskCompleted: 'hooks.matcher.TaskCompleted',
  WorktreeCreate: 'hooks.matcher.WorktreeCreate',
  WorktreeRemove: 'hooks.matcher.WorktreeRemove',
  CwdChanged: 'hooks.matcher.CwdChanged',
  MessageDisplay: 'hooks.matcher.MessageDisplay',
} as const satisfies Partial<Record<HookEvent, string>>;

for (const [event, id] of Object.entries(NO_SUPPORT)) {
  if (!isNoSupport(event)) continue;
  spec(id, () => {
    test(`${event} fires on every occurrence and ignores its matcher`, () => {
      const agent = withMatcher(event, 'never-matches');
      for (const matcherValue of [undefined, 'never-matches', 'anything']) {
        expect(commands(agent, { event, matcherValue, run: 'main-session' })).toEqual(['./run.sh']);
      }
    });

    test(`an event with matcher support does not behave so: the same matcher on ${event}'s neighbour with support filters`, () => {
      const filtered = withMatcher('PreToolUse', 'never-matches');
      expect(commands(filtered, { event: 'PreToolUse', matcherValue: 'Bash' })).toEqual([]);
    });
  });
}
