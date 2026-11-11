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
 * the name rules do not read it, the caller gives the plugin directory as `dirName`). A `bundled`
 * skill is the host's own (skills.md, "Bundled skills"): the kit reads no file for it, the host
 * gives it to the session (`SessionOptions.hostSkills`).
 */
export type SkillOrigin =
  | { readonly kind: 'plugin'; readonly plugin: string; readonly rootSkill?: boolean }
  | { readonly kind: 'managed' }
  | { readonly kind: 'user' }
  | { readonly kind: 'project' }
  | { readonly kind: 'synced' }
  | { readonly kind: 'bundled' };

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
  /**
   * Whether `skillOverrides` applies: "Plugin skills are not affected by `skillOverrides`. Manage
   * those through `/plugin` instead" (skills.md, "Override skill visibility from settings").
   */
  readonly honoursSkillOverrides: boolean;
  /**
   * Whether the files the expanded text names with `@` are attached. A synced skill's body, in a
   * session on the owner's machine, "doesn't attach the files that `@` references name the way it
   * does for a local skill" (skills.md, "How Claude Code handles the body of a synced skill"); an
   * isolated session (cloud, Cowork) keeps the local behaviour, as for `runsShell`.
   */
  readonly attachesFileReferences: boolean;
}

export const ORIGIN_TRAITS: { readonly [K in SkillOriginKind]: OriginTraits } = {
  plugin: {
    substitutesPluginVariables: true,
    substitutesSessionVariables: true,
    runsShell: true,
    honoursSkillOverrides: false,
    attachesFileReferences: true,
  },
  managed: {
    substitutesPluginVariables: false,
    substitutesSessionVariables: true,
    runsShell: true,
    honoursSkillOverrides: true,
    attachesFileReferences: true,
  },
  user: {
    substitutesPluginVariables: false,
    substitutesSessionVariables: true,
    runsShell: true,
    honoursSkillOverrides: true,
    attachesFileReferences: true,
  },
  project: {
    substitutesPluginVariables: false,
    substitutesSessionVariables: true,
    runsShell: true,
    honoursSkillOverrides: true,
    attachesFileReferences: true,
  },
  synced: {
    substitutesPluginVariables: false,
    substitutesSessionVariables: false,
    runsShell: false,
    honoursSkillOverrides: true,
    attachesFileReferences: false,
  },
  // "set one skill to `"off"` in `skillOverrides` to hide it" (skills.md, "Remove a skill").
  bundled: {
    substitutesPluginVariables: false,
    substitutesSessionVariables: true,
    runsShell: true,
    honoursSkillOverrides: true,
    attachesFileReferences: true,
  },
};

/** The frontmatter a skill and a command share, with the documented defaults applied. */
export interface InvocableFrontmatter {
  /** `description`; else the first non-empty line of the body (skills.md, frontmatter reference). */
  readonly description?: string;
  /** `when_to_use`, appended to the description in the listing. */
  readonly whenToUse?: string;
  /**
   * Neither `description` nor `when_to_use` is set (a blank value is not set): Claude Code does not
   * list it to the model, though the Skill tool still runs it and the `/` menu shows it with the
   * first body line (oracle 2.1.319, judgment in spec/judgments.md).
   */
  readonly undescribed?: true;
  /** `argument-hint`, shown in autocomplete. */
  readonly argumentHint?: string;
  /** `arguments`: names for `$name`, in argument order. */
  readonly arguments: readonly string[];
  /** `disable-model-invocation`, default `false`. */
  readonly disableModelInvocation: boolean;
  /** `user-invocable`, default `true`. */
  readonly userInvocable: boolean;
  /** `allowed-tools`: permission rules as written; `substituteAllowedTools` substitutes `${CLAUDE_*}` in its Bash rules. */
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
  /**
   * Whether the frontmatter set `shell`: an explicit `shell: bash` fails the invocation when bash is
   * missing, while the default falls back to PowerShell (skills.md, "How injected commands run").
   */
  readonly shellDeclared?: true;
  /** `metadata`: a free-form map the kit keeps and never reads. */
  readonly metadata?: Readonly<Record<string, unknown>>;
  /** `license`: kept, never acted on. */
  readonly license?: string;
  /** `compatibility`: kept, never acted on. */
  readonly compatibility?: string;
  /**
   * The frontmatter as the YAML parsed it: every key, one the kit does not know included, with no
   * default and no reading applied; empty when the file has none or it does not parse. The kit gives
   * no meaning to a key it does not know ("Claude Code ignores a field it doesn't recognize"); a host
   * reads its own keys here without parsing the file again (judgment, spec/judgments.md).
   */
  readonly frontmatter: Readonly<Record<string, unknown>>;
}

export interface Skill extends InvocableFrontmatter {
  readonly kind: 'skill';
  /** The name the skill goes by: the frontmatter `name`, else the skill folder's name. */
  readonly name: string;
  /** What the user types after `/`: `my-plugin:review` for a plugin skill, else `review`. */
  readonly command: string;
  /**
   * A plugin skill whose folder fixed its name (`SkillLayout.fixedName`) but whose frontmatter
   * `name` differs: the command that `name` gives (`my-plugin:fancy` for `skills/review/` with
   * `name: fancy`). Oracle 2.1.322 (spec/judgments.md): it is not listed, yet it and its bare part
   * invoke the skill and preload it in an agent's `skills` field. Absent otherwise.
   */
  readonly declaredCommand?: string;
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

/**
 * A skill or a command read without its body: every field of the frontmatter and the identity, so a
 * catalog, a listing and a `/` menu are built, and no Markdown is kept in memory (judgment,
 * spec/judgments.md, "metadata-first catalog"). The body is read when the skill runs, through a
 * `BodyReader`.
 */
export type SkillHead = Omit<Skill, 'body'>;
export type CommandHead = Omit<Command, 'body'>;
export type InvocableHead = SkillHead | CommandHead;

/**
 * Reads the body of a skill or command the catalog holds without it. The read happens when it is
 * called, through the host's file port, and nothing is memoized: a body edited since the scan is
 * what the call returns (skills.md, "Edit a skill during a session"), and a host that wants a cache
 * keeps its own. It is `undefined` when the file is gone or no longer loads as a skill, and it
 * rejects with the port's own error when the host's port refuses the read (a file over a size limit,
 * text that is not UTF-8). The frontmatter fields stay as the scan read them until the next scan.
 */
export type BodyReader = (signal?: AbortSignal) => Promise<string | undefined>;

/** Where a `SKILL.md` sits: its origin and the name of its folder. */
export interface SkillLayout {
  readonly origin: SkillOrigin;
  readonly dirName: string;
  /**
   * `dirName` is already the skill's name, as the plugin loader chose it, and a frontmatter `name`
   * renames nothing. Claude Code 2.1.319 names a plugin skill that a scan finds (`skills/<folder>/`,
   * or a folder of skills a manifest path lists) after its folder, and uses the frontmatter `name`
   * only for a folder a path names itself and for the plugin-root `SKILL.md`; the loader makes that
   * choice (spec/judgments.md, "oracle 2.1.319 overrides docs").
   */
  readonly fixedName?: true;
}
