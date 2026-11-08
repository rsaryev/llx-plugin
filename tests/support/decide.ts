import type { PermissionBehavior, PermissionMode } from '../../src/protocol/official.ts';
import {
  decide,
  type DecideContext,
  type Decision,
  type DecisionReason,
  type MatchContext,
  type PathContext,
  type PermissionRule,
} from '../../src/rules/index.ts';
import { call, matchContext, parsed } from './rule-context.ts';

/** A session in `/work/app`, home `/home/alice`, on a POSIX host, at a terminal, nothing else enabled. */
export const baseContext = (
  mode: PermissionMode,
  overrides: Partial<DecideContext> = {},
): DecideContext => ({
  mode,
  rules: [],
  match: matchContext,
  autoAvailable: false,
  bypassAvailable: false,
  interactive: true,
  ...overrides,
});

/** The rules written as `[behavior, text]` pairs, in a project settings file. */
export const rulesOf = (...entries: readonly [PermissionBehavior, string][]): PermissionRule[] =>
  entries.map(([behavior, text]) => parsed(text, behavior));

/** A match context whose path facts are `overrides` on the `/work/app` session. */
export const pathsWith = (overrides: Partial<PathContext>): MatchContext => ({
  ...matchContext,
  paths: { ...matchContext.paths, ...overrides },
});

/** What `decide` says for `toolName` with `input`, in `mode`, with `overrides` on the context. */
export const decision = (
  mode: PermissionMode,
  toolName: string,
  input: unknown,
  overrides: Partial<DecideContext> = {},
): Decision => decide(call(toolName, input), baseContext(mode, overrides));

/** The Bash call of `command`. */
export const bash = (
  mode: PermissionMode,
  command: string,
  overrides: Partial<DecideContext> = {},
): Decision => decision(mode, 'Bash', { command }, overrides);

const PATH_FIELD = {
  Read: 'file_path',
  Edit: 'file_path',
  Write: 'file_path',
  Grep: 'path',
  Glob: 'path',
  NotebookEdit: 'notebook_path',
} as const;

/** The Read, Edit, Write, Grep or other path call of `tool` acting on `path`. */
export const onPath = (
  mode: PermissionMode,
  tool: keyof typeof PATH_FIELD,
  path: string,
  overrides: Partial<DecideContext> = {},
): Decision => decision(mode, tool, { [PATH_FIELD[tool]]: path }, overrides);

export const allow = (reason: DecisionReason): Decision => ({ outcome: 'allow', reason });
export const ask = (reason: DecisionReason): Decision => ({ outcome: 'ask', reason });
export const deny = (reason: DecisionReason): Decision => ({ outcome: 'deny', reason });
export const classify = (reason: DecisionReason): Decision => ({ outcome: 'classify', reason });
