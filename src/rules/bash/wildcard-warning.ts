import { RESTRICTS } from '../restricts.ts';
import { warning, type PluginIssue } from '../../format/issues.ts';
import type { PermissionRule } from '../types.ts';
import { wordsOf } from './words.ts';
import { textPatternOf } from './text-pattern.ts';
import { normalizePattern } from './wildcard.ts';
import { SETTINGS_FILE } from '../../format/settings-files.ts';

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
 * The row shown below the startup banner in an interactive session (errors.md, "Has a wildcard
 * before the rest of the command"): `⚠ Allow rule Bash(git -C * status *) allows any option at its * · use an exact value`.
 */
export const wildcardBannerRow = (rule: PermissionRule): string =>
  `⚠ Allow rule ${rule.text} allows any option at its * · use an exact value`;

/**
 * What follows `Permission allow rule` in parentheses: "a settings file path, or the `--allowed-tools`
 * flag itself". The file names are the documented locations of each source; a registry typed over
 * the source kinds, so a new kind fails the typecheck.
 */
type Source = PermissionRule['source'];
const SOURCE_LABELS: {
  readonly [K in Source['kind']]: (source: Extract<Source, { kind: K }>) => string;
} = {
  managed: () => 'managed settings',
  'embedder-managed': () => 'managed settings',
  project: () => SETTINGS_FILE.project,
  local: () => SETTINGS_FILE.local,
  user: () => SETTINGS_FILE.user,
  'flag-settings': (source) => source.file,
  cli: () => '--allowed-tools',
  session: () => 'session',
};

const sourceLabel = <K extends Source['kind']>(rule: {
  readonly source: Extract<Source, { kind: K }>;
}): string => SOURCE_LABELS[rule.source.kind](rule.source);

/** The part of the warning that is specific to git, whose options can run commands (errors.md). */
const GIT_NOTE = ' For git, options such as -c and --exec-path can run arbitrary commands.';

/** errors.md names a `Bash` rule; Monitor and PowerShell are not named (spec/judgments.md). */
const WARNED_TOOLS: ReadonlySet<string> = new Set(['Bash']);

/**
 * The startup warning for a Bash allow rule with a `*` before the subcommand. Claude Code "keeps
 * the rule and changes nothing about how it matches", so this is only a warning.
 */
export function wildcardBeforeSubcommand(rule: PermissionRule): readonly PluginIssue[] {
  const text = textPatternOf(rule);
  // errors.md: the warning is about an allow rule (a deny or ask rule only restricts more).
  const applies =
    !RESTRICTS[rule.behavior] &&
    WARNED_TOOLS.has(rule.value.toolName) &&
    text !== undefined &&
    hasWildcardBeforeSubcommand(text);
  return applies
    ? [
        warning(
          'permissions.allow',
          `Permission allow rule (${sourceLabel(rule)}): ${rule.text} has a wildcard before the rest of the command, so it also matches any options inserted at that position and approves them without a prompt.${text.startsWith('git ') ? GIT_NOTE : ''} Replace that * with the exact value you mean, or only use * after the subcommand (for example Bash(git status *)).`,
        ),
      ]
    : [];
}
