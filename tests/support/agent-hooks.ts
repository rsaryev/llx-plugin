/** The docs' code-reviewer and db-reader agents and a way to ask what would fire (tests/agents/hooks*). */
import { readAgent } from '../../src/format/agent.ts';
import type { AgentRecord } from '../../src/format/agent-record.ts';
import { selectAgentHooks, type AgentRunKind } from '../../src/agents/hooks.ts';
import type { HookEvent } from '../../src/protocol/official.ts';
import { at, file, loaded } from './agent-files.ts';

export const CODE_REVIEWER = `name: code-reviewer
description: Review code changes with automatic linting
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/validate-command.sh"
  PostToolUse:
    - matcher: "Edit|Write"
      hooks:
        - type: command
          command: "./scripts/run-linter.sh"
  Stop:
    - hooks:
        - type: command
          command: "./scripts/summarize.sh"`;

const DB_READER = `name: db-reader
description: Execute read-only database queries.
tools: Bash
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/validate-readonly-query.sh"`;

export const reviewer = (source: 'project' | 'user' | 'managed' = 'user'): AgentRecord =>
  loaded(readAgent(file(CODE_REVIEWER), at(source)));
export const dbReader = (): AgentRecord => loaded(readAgent(file(DB_READER), at('user')));

export interface Fire {
  readonly event: HookEvent;
  readonly matcherValue?: string | undefined;
  readonly run?: AgentRunKind;
  readonly active?: boolean;
  readonly folderTrusted?: boolean;
}

/** The commands that would run for one occurrence of an event. */
export function commands(agent: AgentRecord, fire: Fire): string[] {
  const selection = selectAgentHooks(agent, {
    run: 'subagent',
    active: true,
    folderTrusted: true,
    matcherValue: undefined,
    ...fire,
  });
  return selection.groups.flatMap((group) =>
    group.hooks.flatMap((hook) => (hook.type === 'command' ? [hook.command] : [])),
  );
}

export const VALIDATE = './scripts/validate-command.sh';
export const LINT = './scripts/run-linter.sh';
export const SUMMARIZE = './scripts/summarize.sh';
