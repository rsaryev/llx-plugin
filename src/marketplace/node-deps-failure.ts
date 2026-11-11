import { warning, type PluginIssue } from '../format/issues.ts';
import type { CommandResult } from '../ports/command-runner.ts';
import {
  INSTALL_TIMEOUT_MS,
  isSkip,
  type NodeDepsPlan,
  type NodeDepsSkip,
  type SkipOf,
  type SkipReason,
  type UnsupportedLockfile,
} from './node-deps-types.ts';
import type { ReadPackageJson } from './node-deps-spec.ts';

/**
 * What the user sees when the dependency install fails or cannot run, and that the plugin still
 * loads (plugins/loading.md, "When the dependency install fails or is skipped": "the plugin still
 * loads, but the parts of it that need the missing packages may not work"; plugins/
 * troubleshooting.md, "The packages it lists are not installed" / "were not installed, because
 * ..."). The docs give the two openings of the note, the command it gives and the example reasons;
 * the words that join them are the kit's (spec/judgments.md).
 */

// ---- the reasons an install cannot run ----

/** What to do about each unsupported lockfile: "Ship a text `bun.lock` or an npm lockfile instead" / "replace it with an npm lockfile". */
const LOCKFILE_ADVICE: { readonly [N in UnsupportedLockfile]: string } = {
  'bun.lockb':
    "it has a bun.lockb lockfile, Bun's binary format, which Claude Code cannot check; the plugin's author has to ship a text bun.lock or an npm lockfile instead",
  'yarn.lock':
    'it has a yarn.lock lockfile, which Claude Code does not install from; the plugin’s author has to replace it with an npm lockfile',
  'pnpm-lock.yaml':
    'it has a pnpm-lock.yaml lockfile, which Claude Code does not install from; the plugin’s author has to replace it with an npm lockfile',
};

const listed = (names: readonly string[]): string => names.join('; ');

/** The clause after "because", per reason, over the fields that reason carries. */
const CLAUSES: { readonly [R in SkipReason]: (skip: SkipOf<R>) => string } = {
  'loaded-in-place': () =>
    'it loads in place and Claude Code does not install packages into a source directory',
  'link-mode': () =>
    'a link-mode plugin gets no install; the directory it links to has to contain the packages in node_modules already',
  'no-package-json': () => 'it has no package.json',
  'package-json-unreadable': () => 'its package.json is not a readable JSON object',
  'no-lockfile': () => 'it has no bun.lock, npm-shrinkwrap.json or package-lock.json lockfile',
  'unsupported-lockfile': (skip) =>
    skip.lockfiles.map((name) => LOCKFILE_ADVICE[name]).join('; and '),
  'lockfile-format': (skip) =>
    `its ${skip.lockfile} has a lockfileVersion of ${skip.version ?? 'none'} that Claude Code does not read (npm needs 2 or 3, bun.lock no higher than 2)`,
  'package-manager-missing': (skip) =>
    `its lockfile needs ${skip.manager}, and ${skip.manager} is not installed on this computer; install it, then update the plugin`,
  overrides: () => 'its package.json sets npm overrides, which the install does not apply',
  'patched-dependencies': () =>
    'its package.json sets Bun patchedDependencies, which the install does not apply',
  'non-registry-dependency': (skip) =>
    `it has dependencies that are not registry packages (${listed(skip.dependencies)}); only registry packages pinned to an exact version are installed`,
  'unpinned-dependency': (skip) =>
    `it has packages that are not pinned to an exact version in its lockfile (${listed(skip.packages)}); only registry packages pinned to an exact version are installed`,
  'insecure-download': (skip) =>
    `its lockfile has a download link that is not https (${listed(skip.links)})`,
  'lockfile-mismatch': (skip) =>
    `its package.json and its lockfile do not list the same dependencies (${listed(skip.differences)})`,
  'install-folder': (skip) => `the install folder ${skip.installDir} lies inside the plugin`,
};

/** Whether the plugin has a cached copy that could show the note (a plugin loaded in place has none). */
const CACHED: { readonly [R in SkipReason]: boolean } = {
  'loaded-in-place': false,
  'link-mode': true,
  'no-package-json': true,
  'package-json-unreadable': true,
  'no-lockfile': true,
  'unsupported-lockfile': true,
  'lockfile-format': true,
  'package-manager-missing': true,
  overrides: true,
  'patched-dependencies': true,
  'non-registry-dependency': true,
  'unpinned-dependency': true,
  'insecure-download': true,
  'lockfile-mismatch': true,
  'install-folder': true,
};

/**
 * Why an install cannot run, as the clause that follows "because" in the note (`it has no
 * package.json`): for a host that words its own message, such as `Node.js packages were not
 * installed: <clause>`.
 */
export function skipReasonText<R extends SkipReason>(skip: SkipOf<R>): string {
  return CLAUSES[skip.reason](skip);
}

// ---- the note ----

export type NoteKind = 'not-installed' | 'not-installed-because';

export interface NodeDepsNote {
  readonly kind: NoteKind;
  /** The note `/plugin` and `claude plugin list` show. */
  readonly text: string;
  /** "run the `claude plugin update` command that the note gives"; absent when updating cannot help. */
  readonly updateCommand?: string;
  /** What to do when the automatic install cannot provide the packages. */
  readonly advice?: string;
  /** The note as a finding: a warning, because the plugin still loads. */
  readonly issues: readonly PluginIssue[];
}

/** The cached copy of an enabled plugin, as far as the note goes. */
export interface CachedCopy {
  readonly enabled: boolean;
  /** Any lockfile is at the plugin root, supported or not. */
  readonly hasLockfile: boolean;
  readonly packageJson: ReadPackageJson | undefined;
  readonly hasNodeModules: boolean;
}

const nonEmpty = (map: Readonly<Record<string, string>> | undefined): boolean =>
  map !== undefined && Object.keys(map).length > 0;

/** "a `package.json` that lists runtime dependencies": `dependencies` and `optionalDependencies`, not dev ones (judgment). */
const listsRuntimeDependencies = (packageJson: ReadPackageJson | undefined): boolean =>
  packageJson !== undefined &&
  typeof packageJson !== 'string' &&
  (nonEmpty(packageJson.dependencies) || nonEmpty(packageJson.optionalDependencies));

const FALLBACK =
  'Install them from a hook into ${CLAUDE_PLUGIN_DATA}: packages that need their lifecycle scripts to build, Python dependencies, plugins locked with Yarn or pnpm and dependencies that are not registry packages are all out of reach of the automatic install.';

const note = (id: string, fields: Omit<NodeDepsNote, 'issues'>): NodeDepsNote => ({
  ...fields,
  issues: [warning(id, fields.text)],
});

function unfinished(id: string): NodeDepsNote {
  const updateCommand = `claude plugin update ${id}`;
  return note(id, {
    kind: 'not-installed',
    text: `The packages it lists are not installed. To retry, run: ${updateCommand}`,
    updateCommand,
  });
}

function cannotRun(id: string, skip: NodeDepsSkip): NodeDepsNote {
  return note(id, {
    kind: 'not-installed-because',
    text: `The packages it lists were not installed, because ${skipReasonText(skip)}.`,
    advice: FALLBACK,
  });
}

/**
 * The note on an enabled plugin whose cached copy has a lockfile and a `package.json` that lists
 * runtime dependencies, but no `node_modules`: `are not installed` when the install can run and did
 * not finish, `were not installed, because ...` when it cannot run. `plan` is what
 * `planNodeDepsInstall` says for the copy now; none for a plugin that has no cached copy.
 */
export function nodeDepsNote(
  copy: CachedCopy,
  plan: NodeDepsPlan,
  id: string,
): NodeDepsNote | undefined {
  const shown =
    copy.enabled &&
    copy.hasLockfile &&
    listsRuntimeDependencies(copy.packageJson) &&
    !copy.hasNodeModules;
  if (!shown) return undefined;
  if (!isSkip(plan)) return unfinished(id);
  return CACHED[plan.reason] ? cannotRun(id, plan) : undefined;
}

/** Whether `claude plugin update` retries the install for this note. */
const RETRIES: { readonly [K in NoteKind]: boolean } = {
  // "To retry the install, run the `claude plugin update` command that the note gives"
  'not-installed': true,
  // "Updating the plugin doesn't install the packages while that reason stands."
  'not-installed-because': false,
};

/**
 * "While `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` is set, `claude plugin update` and `/plugin`
 * skip the retry and report that the plugin is at its latest version."
 */
export const updateRetriesInstall = (
  shown: NodeDepsNote,
  nonessentialTrafficDisabled: boolean,
): boolean => RETRIES[shown.kind] && !nonessentialTrafficDisabled;

// ---- a run that failed ----

export type NodeDepsFailureCause = 'did-not-start' | 'timed-out' | 'aborted' | 'exit-code';

export type InstallOutcome =
  | { readonly state: 'installed' }
  | { readonly state: 'failed'; readonly cause: NodeDepsFailureCause; readonly message: string };

const OUTPUT_LINES = 20;

const outputTail = (result: CommandResult): string =>
  `${result.stdout}${result.stderr}`.trim().split('\n').slice(-OUTPUT_LINES).join('\n');

interface Cause {
  readonly cause: NodeDepsFailureCause;
  readonly matches: (result: CommandResult) => boolean;
  readonly describe: (result: CommandResult) => string;
}

/** In the order they are told apart. */
const CAUSES: readonly Cause[] = [
  {
    cause: 'did-not-start',
    matches: (result) => result.startError !== undefined,
    describe: (result) => `The package manager did not start: ${result.startError ?? ''}`,
  },
  {
    // "Claude Code stops an install that runs longer and treats it as failed."
    cause: 'timed-out',
    matches: (result) => result.timedOut,
    describe: () =>
      `The dependency install ran longer than ${INSTALL_TIMEOUT_MS / 1000} seconds and was stopped`,
  },
  {
    cause: 'aborted',
    matches: (result) => result.exitCode === null,
    describe: () => 'The dependency install was aborted',
  },
  {
    cause: 'exit-code',
    matches: (result) => result.exitCode !== 0,
    describe: (result) => `The dependency install failed with exit code ${result.exitCode}`,
  },
];

/** What a finished run means: installed, or failed with its cause and the end of its output. */
export function installOutcome(result: CommandResult): InstallOutcome {
  const found = CAUSES.find((candidate) => candidate.matches(result));
  if (found === undefined) return { state: 'installed' };
  const tail = outputTail(result);
  const message = `${found.describe(result)}.${tail === '' ? '' : `\n${tail}`}`;
  return { state: 'failed', cause: found.cause, message };
}
