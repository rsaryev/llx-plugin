import type { EffortLevel } from '../protocol/official.ts';
import type { HooksSettings } from '../protocol/hook-config.ts';
import type { Assert, Equal } from '../protocol/type-equality.ts';
import type { ShellKind } from '../ports/command-runner.ts';

/**
 * The model of a skill and of a command (skills.md, "Configure skills"; plugins/components.md,
 * "Skills" and "Commands"). A command file is "the older format" and "supports the same
 * frontmatter" as a skill (skills.md, "Choose where skills load"), so both carry one
 * `InvocableFrontmatter`.
 */

/** The shells `shell` accepts (skills.md, frontmatter reference: "`bash` (default) or `powershell`"). */
export const SKILL_SHELLS = ['bash', 'powershell'] as const satisfies readonly ShellKind[];
export type SkillShell = (typeof SKILL_SHELLS)[number];

/** @public A compile-time drift guard: a shell added to `ShellKind` fails the typecheck here. */
export type SkillShellsMatchShellKind = Assert<Equal<SkillShell, ShellKind>>;

/**
 * Where a skill came from, which decides what the runtime may do with its text. A plugin skill is
 * namespaced by its plugin (`rootSkill`: the plugin's own `SKILL.md`, which has no skill folder;
 * the name rules do not read it, the caller gives the plugin directory as `dirName`).
 */
export type SkillOrigin =
  | { readonly kind: 'plugin'; readonly plugin: string; readonly rootSkill?: boolean }
  | { readonly kind: 'user' }
  | { readonly kind: 'project' }
  | { readonly kind: 'synced' };

export type SkillOriginKind = SkillOrigin['kind'];

/** What differs per origin; a registry typed over the union (K1), read by the expansion. */
export interface OriginTraits {
  /** `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}`: "Substituted only in plugin skills". */
  readonly substitutesPluginVariables: boolean;
  /**
   * `${CLAUDE_PROJECT_DIR}` and `${CLAUDE_SESSION_ID}`. A synced skill is not substituted these
   * in a session on the owner's machine: "the two placeholders reach Claude as literal text"
   * (skills.md, "How Claude Code handles the body of a synced skill"). An isolated session (cloud,
   * Cowork) is the host's decision, as for `runsShell`.
   */
  readonly substitutesSessionVariables: boolean;
  /**
   * Whether `` !`command` `` blocks run. A skill synced from claude.ai "doesn't run `!` commands"
   * in a session on the owner's machine (skills.md, "How Claude Code handles the body of a synced
   * skill"); a cloud or Cowork session is the host's decision, not an origin's.
   */
  readonly runsShell: boolean;
}

export const ORIGIN_TRAITS: { readonly [K in SkillOriginKind]: OriginTraits } = {
  plugin: { substitutesPluginVariables: true, substitutesSessionVariables: true, runsShell: true },
  user: { substitutesPluginVariables: false, substitutesSessionVariables: true, runsShell: true },
  project: {
    substitutesPluginVariables: false,
    substitutesSessionVariables: true,
    runsShell: true,
  },
  synced: {
    substitutesPluginVariables: false,
    substitutesSessionVariables: false,
    runsShell: false,
  },
};

/** The frontmatter a skill and a command share, with the documented defaults applied. */
export interface InvocableFrontmatter {
  /** `description`; else the first non-empty line of the body (skills.md, frontmatter reference). */
  readonly description?: string;
  /** `when_to_use`, appended to the description in the listing. */
  readonly whenToUse?: string;
  /** `argument-hint`, shown in autocomplete. */
  readonly argumentHint?: string;
  /** `arguments`: names for `$name`, in argument order. */
  readonly arguments: readonly string[];
  /** `disable-model-invocation`, default `false`. */
  readonly disableModelInvocation: boolean;
  /** `user-invocable`, default `true`. */
  readonly userInvocable: boolean;
  /** `allowed-tools`: permission rules as written; `${CLAUDE_*}` is not substituted yet. */
  readonly allowedTools: readonly string[];
  /** `disallowed-tools`, as written. */
  readonly disallowedTools: readonly string[];
  /** `model`, as written (`inherit` keeps the active model). */
  readonly model?: string;
  /** `effort`: one of the five documented levels. */
  readonly effort?: EffortLevel;
  /** `context`: `fork` runs the skill in a forked subagent. */
  readonly context?: 'fork';
  /** `agent`: the subagent type for `context: fork`. */
  readonly agent?: string;
  /** `background`, default `true`; only applies with `context: fork`. */
  readonly background: boolean;
  /** `hooks`, in the official configuration shape and validated by the hooks reader. */
  readonly hooks?: HooksSettings;
  /** `paths`: globs limiting when the skill activates. */
  readonly paths: readonly string[];
  /** `shell`, default `bash`. */
  readonly shell: SkillShell;
  /** `metadata`: a free-form map the kit keeps and never reads. */
  readonly metadata?: Readonly<Record<string, unknown>>;
  /** `license`: kept, never acted on. */
  readonly license?: string;
  /** `compatibility`: kept, never acted on. */
  readonly compatibility?: string;
}

export interface Skill extends InvocableFrontmatter {
  readonly kind: 'skill';
  /** The name the skill goes by: the frontmatter `name`, else the skill folder's name. */
  readonly name: string;
  /** What the user types after `/`: `my-plugin:review` for a plugin skill, else `review`. */
  readonly command: string;
  /** The `SKILL.md` path as the host gave it. */
  readonly path: string;
  /** The skill's folder (the directory of `path`; `.` when the file sits at the root). */
  readonly dir: string;
  readonly origin: SkillOrigin;
  /** The Markdown after the frontmatter. */
  readonly body: string;
}

/** A command file or a manifest `commands` entry. */
export interface Command extends InvocableFrontmatter {
  readonly kind: 'command';
  readonly name: string;
  readonly command: string;
  readonly origin: SkillOrigin;
  /** The file, for a file-based command or a `source` entry. */
  readonly path?: string;
  /** The file's body, or the entry's inline `content`. */
  readonly body: string;
}

/** Where a `SKILL.md` sits: its origin and the name of its folder. */
export interface SkillLayout {
  readonly origin: SkillOrigin;
  readonly dirName: string;
}
