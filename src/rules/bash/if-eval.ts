import type { PluginIssue } from '../../format/issues.ts';
import { matchRule } from '../evaluate.ts';
import { parseRule } from '../parse.ts';
import { ruleFormatOf, type RuleFormatId } from '../specifier-formats.ts';
import { toolNameMatches } from '../tool-pattern.ts';
import type { MatchContext, PermissionRule, PreparedCall } from '../types.ts';
import { commandOf } from './shell.ts';
import { scanCommand } from './split.ts';
import { textPatternOf } from './text-pattern.ts';
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

/** Where an `if` issue is reported: the field of the hook handler, not a permissions list. */
const IF_PATH = 'hooks.if';

/**
 * hooks.md ("Match Monitor commands"): a Monitor call also answers to a rule that names Bash ("the
 * hook still gets the Monitor call's input"); a Bash call never answers to a Monitor rule. The
 * names a call answers to, by its own tool name.
 */
const ANSWERS_TO: ReadonlyMap<string, readonly string[]> = new Map([
  ['Monitor', ['Monitor', 'Bash']],
]);

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
  const pattern = textPatternOf(rule);
  if (pattern === undefined) return false;
  const command = commandOf(call.input);
  const scan = command === undefined ? undefined : scanCommand(command);
  if (scan === undefined || !scan.parseable) return true;
  return specifiesMoreThanName(pattern) && scan.substitutes;
}

/** What `parseRule` says about the `if` text, reported at the handler's field. */
const ifIssue = (issue: PluginIssue): PluginIssue => ({
  ...issue,
  path: IF_PATH,
  message: `${issue.message}. The \`if\` filter does not apply, so the hook runs for every call`,
});

/**
 * Whether a hook handler with this `if` runs for this tool call (hooks.md, "Common fields"): the
 * rule is read as permission rule syntax and matches the way a deny or ask rule does, any
 * subcommand being enough, except that a single-directory path pattern keeps the depth of an allow
 * rule (`depthOf`). A rule the kit cannot read runs the handler and reports why: the `if`
 * filter is best effort (spec/judgments.md). Which events evaluate `if` is the hooks engine's.
 */
export function evaluateIf(
  ifRule: string,
  toolName: string,
  toolInput: unknown,
  ctx: MatchContext,
): IfResult {
  const parsed = parseRule(ifRule, { behavior: 'deny', source: { kind: 'cli' } });
  const issues = parsed.issues.map(ifIssue);
  if (parsed.rule === undefined) return { runs: true, issues };
  const { rule } = parsed;
  const calls = (ANSWERS_TO.get(toolName) ?? [toolName]).map((name): PreparedCall => ({
    toolName: name,
    input: toolInput,
  }));
  // hooks.md, "Common fields": a single-directory path pattern is not widened to every depth.
  const reading: MatchContext = { ...ctx, depthOf: 'allow' };
  const runs = calls.some((call) => matchRule(rule, call, reading) || cannotTell(rule, call));
  return { runs, issues };
}
