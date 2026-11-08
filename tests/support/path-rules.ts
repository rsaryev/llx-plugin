import type { PermissionBehavior } from '../../src/protocol/official.ts';
import {
  matchRule,
  type MatchContext,
  type PathContext,
  type RuleSource,
} from '../../src/rules/index.ts';
import { call, matchContext, parsed } from './rule-context.ts';

/** The input field each path tool carries its path in (hooks.md, the PreToolUse input tables). */
const PATH_FIELDS: Readonly<Record<string, Record<string, unknown>>> = {
  Read: { file_path: undefined },
  Edit: { file_path: undefined, old_string: 'a', new_string: 'b' },
  MultiEdit: { file_path: undefined, edits: [] },
  Write: { file_path: undefined, content: 'x' },
  NotebookEdit: { notebook_path: undefined, new_source: 'x' },
  Glob: { pattern: '*', path: undefined },
  Grep: { pattern: 'x', path: undefined },
};

/** The input a model sends for `toolName` acting on `path`. */
export function inputFor(toolName: string, path: string): Record<string, unknown> {
  const template = PATH_FIELDS[toolName] ?? {};
  return Object.fromEntries(
    Object.entries(template).map(([field, value]) => [field, value === undefined ? path : value]),
  );
}

/** A match context whose path facts are `overrides` on the `/work/app` session of the fixtures. */
export const withPaths = (overrides: Partial<PathContext>): MatchContext => ({
  ...matchContext,
  paths: { ...matchContext.paths, ...overrides },
});

export interface PathOptions {
  readonly tool?: string;
  readonly source?: RuleSource;
  readonly ctx?: MatchContext;
}

/** Whether `ruleText`, written as `behavior`, covers `tool` (default Read) acting on `path`. */
export function covers(
  behavior: PermissionBehavior,
  ruleText: string,
  path: string,
  options: PathOptions = {},
): boolean {
  const { tool = 'Read', source, ctx = matchContext } = options;
  return matchRule(parsed(ruleText, behavior, source), call(tool, inputFor(tool, path)), ctx);
}

export const denies = (ruleText: string, path: string, options?: PathOptions): boolean =>
  covers('deny', ruleText, path, options);
export const allows = (ruleText: string, path: string, options?: PathOptions): boolean =>
  covers('allow', ruleText, path, options);
export const asks = (ruleText: string, path: string, options?: PathOptions): boolean =>
  covers('ask', ruleText, path, options);
