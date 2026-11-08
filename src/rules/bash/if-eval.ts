import type { PluginIssue } from '../../format/issues.ts';
import { matchRule } from '../evaluate.ts';
import { parseRule } from '../parse.ts';
import { ruleFormatOf, type RuleFormatId } from '../specifier-formats.ts';
import { toolNameMatches } from '../tool-pattern.ts';
import type { MatchContext, PermissionRule, PreparedCall } from '../types.ts';
import { commandOf } from './shell.ts';
import { splitCommand } from './split.ts';
import { normalizePattern } from './wildcard.ts';

/** Whether a hook's `if` lets its handler run, with what the kit found wrong in the rule. */
export interface IfResult {
  readonly runs: boolean;
  readonly issues: readonly PluginIssue[];
}

/** The tools whose command can be too opaque to say what it runs. */
const READS_COMMANDS: { readonly [F in RuleFormatId]: boolean } = {
  command: true,
  'powershell-command': true,
  'read-path': false,
  'edit-path': false,
  'skill-name': false,
  'subagent-type': false,
  domain: false,
  bare: false,
};

/** `$(`, a backtick or `$NAME` / `${`: the command may run something the text does not show. */
const SUBSTITUTION = /\$\(|`|\$[A-Za-z_{]/;

/** A single-quoted part is never expanded, so what is inside it is not a substitution. */
const withoutSingleQuoted = (command: string): string => command.replace(/'[^']*'/g, "''");

/**
 * "Patterns that specify more than the command name": what is left of the pattern after its
 * trailing wildcard, `git push` for `git push *`, has more than one word. `rm *` and `rm` name
 * only the command.
 */
const specifiesMoreThanName = (pattern: string): boolean =>
  /\s/.test(normalizePattern(pattern).replace(/ \*$/, '').trim());

/**
 * hooks.md ("How `if` patterns match Bash commands"): "When Claude Code can't determine which
 * commands the Bash input runs, it runs your hook regardless of the pattern", and a pattern that
 * says more than the command name runs on `$()`, backticks or `$VAR`.
 */
function cannotTell(rule: PermissionRule, call: PreparedCall): boolean {
  if (!toolNameMatches(rule, call.toolName) || !READS_COMMANDS[ruleFormatOf(call.toolName)]) {
    return false;
  }
  if (rule.specifier?.form !== 'text') return false;
  const command = commandOf(call.input);
  if (command === undefined || !splitCommand(command).parseable) return true;
  return (
    specifiesMoreThanName(rule.specifier.pattern) && SUBSTITUTION.test(withoutSingleQuoted(command))
  );
}

/**
 * Whether a hook handler with this `if` runs for this tool call (hooks.md, "Common fields"): the
 * rule is read as permission rule syntax and matches the way a deny or ask rule does, any
 * subcommand being enough. A rule the kit cannot read runs the handler and reports why: the `if`
 * filter is best effort (spec/judgments.md). Which events evaluate `if` is the hooks engine's.
 */
export function evaluateIf(
  ifRule: string,
  toolName: string,
  toolInput: unknown,
  ctx: MatchContext,
): IfResult {
  const { rule, issues } = parseRule(ifRule, { behavior: 'deny', source: { kind: 'cli' } });
  if (rule === undefined) return { runs: true, issues };
  const call: PreparedCall = { toolName, input: toolInput };
  return { runs: matchRule(rule, call, ctx) || cannotTell(rule, call), issues };
}
