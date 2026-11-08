import type { PermissionBehavior } from '../../src/protocol/official.ts';
import { parseRule } from '../../src/rules/parse.ts';
import type {
  MatchContext,
  PermissionRule,
  PreparedCall,
  RuleSource,
} from '../../src/rules/types.ts';

/** A match context for a session in `/work/app`, home `/home/alice`, on a POSIX host. */
export const matchContext: MatchContext = {
  paths: {
    cwd: '/work/app',
    home: '/home/alice',
    primaryWorkingDirectory: '/work/app',
    additionalDirectories: [],
    platform: 'posix',
  },
};

const PROJECT: RuleSource = { kind: 'project' };

/** The rule `text` parses to, as written in a project settings file; the test fails if it is skipped. */
export function parsed(
  text: string,
  behavior: PermissionBehavior = 'deny',
  source: RuleSource = PROJECT,
): PermissionRule {
  const { rule, issues } = parseRule(text, { behavior, source });
  if (rule === undefined) {
    throw new Error(`"${text}" was skipped: ${issues.map((found) => found.message).join('; ')}`);
  }
  return rule;
}

/** A tool call as the model sends it. */
export const call = (toolName: string, input: unknown): PreparedCall => ({ toolName, input });
