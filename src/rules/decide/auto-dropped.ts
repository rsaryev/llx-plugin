import { textPatternOf } from '../bash/text-pattern.ts';
import type { PermissionRule } from '../types.ts';

/**
 * permission-modes.md, "How the classifier evaluates actions": "On entering auto mode, broad allow
 * rules that grant arbitrary code execution are dropped": a blanket `Bash(*)` or `PowerShell(*)`,
 * wildcarded interpreters like `Bash(python*)`, package-manager run commands, `Agent` allow rules
 * and `Monitor` allow rules. "Narrow rules like `Bash(npm test)` stay in effect", and the dropped
 * rules come back when auto mode is left (they are only left out of this view of the rules).
 */

/** A bare rule (`Bash(*)` reads as bare; `PowerShell(*)` is the pattern `*`, handled below) on one of the tools whose every use runs code. */
const BARE_TOOLS: ReadonlySet<string> = new Set(['Bash', 'PowerShell', 'Agent', 'Monitor']);

/** The docs name `python`; the others are the same kind of interpreter (spec/judgments.md). */
const INTERPRETERS: ReadonlySet<string> = new Set(['python', 'python3', 'node', 'ruby', 'perl']);

/** The docs say "package-manager run commands" without naming the managers (spec/judgments.md). */
const PACKAGE_RUN = /^(?:npm|yarn|pnpm|bun) run\b/;

const SHELL_TOOLS: ReadonlySet<string> = new Set(['Bash', 'PowerShell']);

function wildcardedInterpreter(pattern: string): boolean {
  const program = pattern.split(' ')[0]?.replace(/\*+$/, '') ?? '';
  return pattern.includes('*') && INTERPRETERS.has(program);
}

/** Whether `rule` is an allow rule auto mode drops. */
export function isDroppedInAuto(rule: PermissionRule): boolean {
  if (rule.behavior !== 'allow') return false;
  const tool = rule.value.toolName;
  if (rule.specifier === undefined) return BARE_TOOLS.has(tool);
  const pattern = textPatternOf(rule);
  return (
    SHELL_TOOLS.has(tool) &&
    pattern !== undefined &&
    (pattern === '*' || wildcardedInterpreter(pattern) || PACKAGE_RUN.test(pattern))
  );
}
