import type { PermissionBehavior } from '../../src/protocol/official.ts';
import type { SpecifierMatchers } from '../../src/rules/matchers.ts';
import { parseRule } from '../../src/rules/parse.ts';
import type { RuleFormatId } from '../../src/rules/specifier-formats.ts';
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

/** A registry whose every matcher records its own format and says yes. */
export const recordingMatchers = (seen: RuleFormatId[]): SpecifierMatchers => {
  const say = (format: RuleFormatId) => () => {
    seen.push(format);
    return true;
  };
  return {
    command: say('command'),
    'powershell-command': say('powershell-command'),
    'read-path': say('read-path'),
    'edit-path': say('edit-path'),
    'skill-name': say('skill-name'),
    'subagent-type': say('subagent-type'),
    domain: say('domain'),
    bare: say('bare'),
  };
};
