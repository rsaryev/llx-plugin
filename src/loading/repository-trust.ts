/**
 * Whether a plugin that a repository supplies loads (plugins/loading.md, "Trust check and component
 * limits for repository plugins" and "Check why a repository plugin didn't load"). Pure: the host
 * answers the facts (`WorkspaceTrust` tells it whether the folder is trusted), the kit decides.
 *
 * A project-scope plugin "loads only after the same trust check that applies to project allow rules
 * in `.claude/settings.json`. Trusting a parent folder or running with `-p` isn't enough." A plugin
 * under the user's own `~/.claude/skills/` is exempt from the check.
 */
import type { SkillsDirBlock } from './repository-types.ts';

/**
 * The places a repository-supplied (or user-skills-folder) plugin comes from: a `@skills-dir` plugin
 * of the project's `.claude/skills/`, a project-scope `@<marketplace>` plugin (enabled in the
 * repository's settings), and a `@skills-dir` plugin of the user's own `~/.claude/skills/`.
 */
export const REPOSITORY_ORIGINS = [
  'skills-dir',
  'marketplace-project-scope',
  'user-skills-dir',
] as const;
export type RepositoryOrigin = (typeof REPOSITORY_ORIGINS)[number];

/** What the host knows about the session and the folder. */
export interface RepositoryPluginFacts {
  readonly origin: RepositoryOrigin;
  /** The workspace trust dialog was accepted for this exact folder (`WorkspaceTrust`). */
  readonly folderTrusted: boolean;
  /** Only a parent folder was trusted. It never suffices; the host may still report it for messages. */
  readonly parentTrusted: boolean;
  /** `claude -p` or an SDK session. It never suffices either. */
  readonly nonInteractive: boolean;
  /** The session's primary working directory is the directory whose `.claude/skills/` holds the plugin. */
  readonly primaryDirIsRoot: boolean;
  /** The session runs in a worktree started from the desktop app. */
  readonly worktree: boolean;
  /** The restriction of managed settings that stops skills-directory plugins, when one applies. */
  readonly managedBlock?: SkillsDirBlock | undefined;
}

export const REPOSITORY_REASONS = [
  'trusted',
  'user-level',
  'blocked-by-managed-settings',
  'not-primary-directory',
  'folder-not-trusted',
] as const;
export type RepositoryReason = (typeof REPOSITORY_REASONS)[number];

/** Where the plugin's files are read from. */
export type RepositorySource = 'primary-directory' | 'main-checkout' | 'user-skills-directory';

export interface RepositoryDecision {
  readonly load: boolean;
  readonly reason: RepositoryReason;
  readonly from: RepositorySource;
}

/** What differs per origin: one row each, so a new origin fails to compile until it has its rules. */
interface OriginRules {
  /** The workspace trust check applies. */
  readonly trustChecked: boolean;
  /** Found by reading the primary directory's `.claude/skills/`, not by a parent search or a setting. */
  readonly locatedByPrimaryDirectory: boolean;
  /** A folder of `~/.claude/skills/` or `.claude/skills/`, which managed settings may block. */
  readonly skillsDirectory: boolean;
  /** Where the files come from, in a worktree or not. */
  readonly source: (worktree: boolean) => RepositorySource;
}

const fromCheckout = (worktree: boolean): RepositorySource =>
  worktree ? 'main-checkout' : 'primary-directory';

const ORIGIN_RULES: { readonly [O in RepositoryOrigin]: OriginRules } = {
  'skills-dir': {
    trustChecked: true,
    locatedByPrimaryDirectory: true,
    skillsDirectory: true,
    source: fromCheckout,
  },
  'marketplace-project-scope': {
    trustChecked: true,
    locatedByPrimaryDirectory: false,
    skillsDirectory: false,
    source: fromCheckout,
  },
  'user-skills-dir': {
    trustChecked: false,
    locatedByPrimaryDirectory: false,
    skillsDirectory: true,
    source: () => 'user-skills-directory',
  },
};

/** One cause that keeps a plugin from loading, and whether it applies. */
interface Check {
  readonly reason: RepositoryReason;
  readonly stops: (facts: RepositoryPluginFacts, rules: OriginRules) => boolean;
}

/**
 * The causes of the docs' list, in the order the decision reports them (judgment, spec/judgments.md:
 * the docs list them without an order). `~/.claude/skills/` plugins skip the trust check, not the
 * managed block.
 */
const CHECKS: readonly Check[] = [
  {
    reason: 'blocked-by-managed-settings',
    stops: (facts, rules) => rules.skillsDirectory && facts.managedBlock !== undefined,
  },
  {
    reason: 'not-primary-directory',
    stops: (facts, rules) => rules.locatedByPrimaryDirectory && !facts.primaryDirIsRoot,
  },
  {
    reason: 'folder-not-trusted',
    stops: (facts, rules) => rules.trustChecked && !facts.folderTrusted,
  },
];

/** The causes that apply to these facts, in the order of `CHECKS`. */
export function repositoryCauses(facts: RepositoryPluginFacts): readonly RepositoryReason[] {
  const rules = ORIGIN_RULES[facts.origin];
  return CHECKS.filter((check) => check.stops(facts, rules)).map((check) => check.reason);
}

/** Whether a repository plugin loads, why not, and which checkout it is read from. */
export function decideRepositoryPlugin(facts: RepositoryPluginFacts): RepositoryDecision {
  const rules = ORIGIN_RULES[facts.origin];
  const from = rules.source(facts.worktree);
  const [cause] = repositoryCauses(facts);
  if (cause !== undefined) return { load: false, reason: cause, from };
  return { load: true, reason: rules.trustChecked ? 'trusted' : 'user-level', from };
}

/**
 * Whether the origin is "repository" content: the trust check and the component limits apply to it.
 * "Neither ... apply to a plugin under your own `~/.claude/skills/`."
 */
export const isRepositorySupplied = (origin: RepositoryOrigin): boolean =>
  ORIGIN_RULES[origin].trustChecked;
