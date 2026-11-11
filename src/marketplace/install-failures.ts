import type { CommitFailure, PreviousCopy } from './ports.ts';

/**
 * The messages of an install that fails after the plugin was fetched (plugins/troubleshooting.md,
 * "Plugin archive integrity check failed", "An npm plugin source must name a registry package",
 * "This plugin uses a source type your Claude Code version does not support", "Plugin <name> has a
 * corrupt manifest file or has an invalid manifest file", "Could not move the new copy of this
 * plugin version into <path>", "does not load (...), so Claude Code ignores the whole file"). The
 * docs quote some of them whole and some in fragments; every fragment they quote is here verbatim,
 * and the words that join the fragments are the kit's (spec/judgments.md).
 */

/** The message of a `sha256` pin that does not match, as the docs print it whole. */
export const archiveIntegrityMessage = (url: string, expected: string, actual: string): string =>
  `Plugin archive integrity check failed for ${url}: expected sha256 ${expected}, got ${actual}. The archive was not installed. Verify the sha256 in the marketplace entry, or that the URL serves the intended file.`;

/** What an npm `package` value refused before any fetch says after the reason ("names the value and the reason"). */
const NPM_REMINDER =
  'An npm plugin source must name a registry package (name or name@version) or link to a tarball file. For a plugin in a git repository, use a "github", "url" or "git-subdir" source.';

/**
 * `"<value>" was not installed: <reason>. An npm plugin source must name a registry package ...`.
 * The docs' example reason is `it is not an http or https link`; `reason` is a clause that starts
 * with `it`.
 */
export const npmRefusalMessage = (value: string, reason: string): string =>
  `"${value}" was not installed: ${reason}. ${NPM_REMINDER}`;

/** The reason the docs give for a value that is not a package name and not a link, such as `github:acme/formatter`. */
export const NOT_A_LINK = 'it is not an http or https link';

/** The message of a source type this version cannot fetch, with the line the docs say follows it. */
export const UNSUPPORTED_SOURCE_TYPE =
  'This plugin uses a source type your Claude Code version does not support. Update Claude Code and try again.';

// ---- the manifest of a fetched plugin ----

/** `Failed to install plugin "<name>@<marketplace>": <message>`: the shell's prefix, with the plugin's real name. */
export const failedToInstallPlugin = (id: string, message: string): string =>
  `Failed to install plugin "${id}": ${message}`;

/**
 * What is wrong with `.claude-plugin/plugin.json` of a plugin that was fetched: not JSON, or JSON
 * that fails the schema. `name` is what the message calls the plugin: "In the shell, the `<name>`
 * in this line can be a temporary directory name", so the caller passes what it has.
 */
export type ManifestProblem =
  | { readonly parse: string }
  | { readonly validation: readonly string[] };

export function manifestFailureMessage(name: string, problem: ManifestProblem): string {
  return 'parse' in problem
    ? `Plugin ${name} has a corrupt manifest file: JSON parse error: ${problem.parse}`
    : `Plugin ${name} has an invalid manifest file: Validation errors: ${problem.validation.join(', ')}`;
}

// ---- moving the new copy into the cache ----

const PREVIOUS_SENTENCE: { readonly [P in PreviousCopy]: string } = {
  none: '',
  'moved-back': 'The previously installed copy was moved back.',
  'removed-first': 'The previously installed copy had to be removed first.',
  'not-moved-back': 'The previously installed copy was not moved back.',
  'could-not-be-moved-back': 'The previously installed copy could not be moved back.',
};

type MoveCause = Exclude<CommitFailure['failure'], 'aborted'>;

interface CauseWording {
  readonly why: (code: string) => string;
  /** What the message says of the earlier copy, or instead of it. */
  readonly outcome: (previous: PreviousCopy) => string;
  /** Whether the way out is to run the install again once other programs let go of the folder. */
  readonly retry: boolean;
}

const CAUSES: { readonly [C in MoveCause]: CauseWording } = {
  busy: {
    why: (code) =>
      `the new copy or the version folder stayed busy while the install ran (${code}) \u2014 usually a scanner still reading the freshly downloaded files, another program using that folder, or another process re-creating it.`,
    outcome: (previous) => PREVIOUS_SENTENCE[previous],
    retry: true,
  },
  // On Windows "the message instead says that copy `could not be replaced` and that `It was not
  // replaced and the new copy was discarded`, so the version you had is still installed."
  held: {
    why: (code) =>
      `another program holds the installed copy itself, so that copy could not be replaced (${code}).`,
    outcome: () => 'It was not replaced and the new copy was discarded.',
    retry: true,
  },
  permission: {
    why: (code) =>
      `the plugin cache folder could not be written (${code}). Check the plugin cache folder's permissions and free disk space.`,
    outcome: (previous) => PREVIOUS_SENTENCE[previous],
    retry: false,
  },
};

const RETRY =
  'Run the install again once other Claude Code sessions or programs using that folder have finished.';

/**
 * `Could not move the new copy of this plugin version into <path>: <why>`, then what became of the
 * copy installed before ("The message says what happened to the copy that was installed before"),
 * then the way out. A `Left on disk` list names the set-aside folders. An abort is not a failed
 * move, so it has no message.
 */
export function moveFailureMessage(path: string, failure: CommitFailure): string | undefined {
  if (failure.failure === 'aborted') return undefined;
  const wording = CAUSES[failure.failure];
  const left = failure.leftOnDisk ?? [];
  return [
    `Could not move the new copy of this plugin version into ${path}: ${wording.why(failure.code ?? 'unknown')}`,
    wording.outcome(failure.previous),
    wording.retry ? RETRY : '',
    left.length === 0 ? '' : `Left on disk: ${left.join(', ')}.`,
  ]
    .filter((part) => part !== '')
    .join(' ');
}

// ---- a settings file that does not load ----

/**
 * Why a settings file does not load: a value Claude Code does not accept (`keys` names the settings
 * in file order) or a top level that is not an object.
 */
export type IgnoredSettings =
  | { readonly invalid: readonly string[] }
  | { readonly notObject: true };

const invalidValues = (keys: readonly string[]): string => {
  const [first = '', ...others] = keys;
  if (others.length === 0) return `its "${first}" is not valid`;
  const noun = others.length === 1 ? 'value' : 'values';
  return `its "${first}" and ${others.length} other ${noun} are not valid`;
};

const FOLLOW_UP =
  'including anything this command wrote there. Fix the file, then run this command again if its change is missing. If a newer Claude Code wrote the file, update Claude Code instead.';

/**
 * The warning after the success line of `claude plugin install`, `enable`, `disable` and
 * `claude plugin marketplace add`: `⚠ <path> does not load (<why>), so Claude Code ignores the whole
 * file, ...`. With several bad values the text names the first and counts the others.
 */
export function settingsIgnoredWarning(path: string, problem: IgnoredSettings): string {
  const why = 'invalid' in problem ? invalidValues(problem.invalid) : 'it is not a JSON object';
  return `⚠ ${path} does not load (${why}), so Claude Code ignores the whole file, ${FOLLOW_UP}`;
}
