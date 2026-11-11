import { parseFrontmatter } from './frontmatter.ts';
import { warning, type PluginIssue } from './issues.ts';
import { FIELD_READERS } from './skill-fields.ts';

/**
 * A memory rule file, `.claude/rules/**\/*.md` (memory.md, "Organize rules with `.claude/rules/`"):
 * "`paths` is the only field Claude Code reads from a rule; any other field is ignored without an
 * error. Claude Code removes the frontmatter before loading the rule into context" ("Rule frontmatter
 * reference"). `paths` "Accepts a YAML list or a comma-separated string" and takes brace expansion,
 * "the same glob format" a skill's `paths` uses, so it is read by the skill reader's `paths` field.
 * Finding the files (recursive, symlinks, `claudeMdExcludes`, `--setting-sources`) is the host's.
 */

/**
 * `user`: `~/.claude/rules/`, whose patterns are relative to "the session's primary working
 * directory"; `project`: a `.claude/rules/` folder, relative to "the directory that contains the
 * rule's `.claude` folder" ("Path-specific rules").
 */
export type MemoryRuleScope = 'user' | 'project';

export interface MemoryRule {
  /** The file as the host names it; a project rule's path holds its `.claude/rules/` folder. */
  readonly path: string;
  readonly scope: MemoryRuleScope;
  /** Empty: the rule "loaded at launch"; else it loads when Claude works with a matching file. */
  readonly paths: readonly string[];
  /** The text after the frontmatter: what loads into context. */
  readonly body: string;
}

export interface MemoryRuleRead {
  readonly rule: MemoryRule;
  readonly issues: readonly PluginIssue[];
}

/**
 * One rule file. "If the YAML between the markers doesn't parse, Claude Code ignores the frontmatter
 * and loads the rule as if it had no `paths`": a warning, and the rule with no `paths`.
 */
export function readMemoryRule(path: string, text: string, scope: MemoryRuleScope): MemoryRuleRead {
  const parsed = parseFrontmatter(text);
  const read = Object.hasOwn(parsed.fields, 'paths')
    ? FIELD_READERS.paths(parsed.fields.paths, 'paths')
    : { values: {}, problems: [] };
  const where = parsed.line === undefined ? '' : ` (line ${parsed.line})`;
  const issues = [
    ...(parsed.problem === undefined
      ? []
      : [warning(path, `frontmatter ${parsed.problem}${where}; the rule loads with no paths`)]),
    ...read.problems.map((found) => warning(path, `${found.key} ${found.reason}`)),
  ];
  return { rule: { path, scope, paths: read.values.paths ?? [], body: parsed.body }, issues };
}
