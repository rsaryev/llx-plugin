import { warning, type PluginIssue } from '../../format/issues.ts';
import type { PermissionRule } from '../types.ts';
import { normalizePattern } from './wildcard.ts';
import { wordsOf } from './split.ts';

const isOption = (word: string): boolean => word.startsWith('-');
const hasStar = (word: string): boolean => word.includes('*');

/**
 * Whether a `*` of the pattern stands where the subcommand, or an option before it, would be and
 * a literal word follows it: `git * main`, `git -C * status *`. errors.md ("Has a wildcard before
 * the rest of the command") describes "a `*` before a later word that determines which command it
 * is" and says to "only use `*` after the subcommand". The kit reads the subcommand as the first
 * word of the pattern after the program that is not an option, so a `*` after it (`git log * main`,
 * a documented rule) is not reported (spec/judgments.md).
 */
function hasWildcardBeforeSubcommand(pattern: string): boolean {
  const [program, ...rest] = wordsOf(normalizePattern(pattern)).map(({ text }) => text);
  if (program === undefined || hasStar(program)) return false;
  const star = rest.findIndex(hasStar);
  if (star === -1 || !rest.slice(0, star).every(isOption)) return false;
  return rest.slice(star + 1).some((word) => !hasStar(word));
}

/**
 * The startup warning for a Bash allow rule with a `*` before the subcommand. Claude Code "keeps
 * the rule and changes nothing about how it matches", so this is only a warning.
 */
export function wildcardBeforeSubcommand(rule: PermissionRule): readonly PluginIssue[] {
  const { specifier, behavior, value } = rule;
  const applies =
    behavior === 'allow' &&
    value.toolName === 'Bash' &&
    specifier?.form === 'text' &&
    hasWildcardBeforeSubcommand(specifier.pattern);
  return applies
    ? [
        warning(
          'permissions.allow',
          `Permission allow rule "${rule.text}" has a wildcard before the rest of the command, so it also matches any options inserted at that position and approves them without a prompt. Replace that * with the exact value you mean, or only use * after the subcommand.`,
        ),
      ]
    : [];
}
