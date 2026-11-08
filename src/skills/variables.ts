import type { PluginIssue } from '../format/issues.ts';
import {
  ORIGIN_TRAITS,
  type Command,
  type Skill,
  type SkillOrigin,
  type SkillOriginKind,
} from '../format/skill-types.ts';
import {
  SURFACE_POLICY,
  substituter,
  type ResolvedUserConfig,
  type SubstitutionScope,
} from '../loading/resolve/index.ts';
import type { EffortLevel } from '../protocol/official.ts';
import type { Environment, Locations } from '../ports/index.ts';

/**
 * The `${CLAUDE_*}` variables of a skill's text (skills.md, "Available string substitutions").
 * The mechanism is `loading/resolve` (the one home of variable substitution, docs/ARCHITECTURE.md);
 * this file decides only what a skill adds to it: its own three variables (`CLAUDE_SESSION_ID`,
 * `CLAUDE_EFFORT`, `CLAUDE_SKILL_DIR`) and which of the six an origin or a session leaves as
 * written.
 */

/** The ports a skill's variables are read through. */
export interface SkillVariablePorts {
  readonly locations: Locations;
  readonly environment: Environment;
}

export interface SkillSession {
  /** `${CLAUDE_SESSION_ID}`. */
  readonly sessionId: string;
  /**
   * `${CLAUDE_EFFORT}`: the effort level in force while the skill runs. A skill that sets its own
   * `effort` runs at that level, so pass the one `resolveTurnOverrides` chose. Absent, the
   * placeholder stays as written.
   */
  readonly effort?: EffortLevel;
  /** The id `Locations` knows the plugin by; default the plugin name of the skill's origin. */
  readonly pluginId?: string;
  /** The saved `userConfig` values of the plugin, for `${user_config.KEY}` in a plugin skill. */
  readonly userConfig?: ResolvedUserConfig;
  /** A Windows host: paths are written with forward slashes (docs/API.md, "Variable substitution"). */
  readonly windows?: boolean;
  /**
   * The session runs in an isolated container, a cloud or Cowork session, where a synced skill
   * "keeps the behavior a local skill has" (skills.md, "How Claude Code handles the body of a
   * synced skill"). False is a session on the owner's machine.
   */
  readonly isolatedSession?: boolean;
  /**
   * The absolute folder `skill.dir` is relative to, when it is not the origin's usual root (a
   * project skill found in a nested `.claude/skills` or in an added directory).
   */
  readonly skillRoot?: string;
  readonly signal?: AbortSignal;
}

/** What `substituteVariables` needs: the shared scope and the names this skill leaves as written. */
export interface SkillVariables {
  readonly scope: SubstitutionScope;
  /** Variable names (without `${}`) that stay as written for this origin and session. */
  readonly literal: readonly string[];
  /** Only a plugin skill is told about an unresolved `${user_config.KEY}`. */
  readonly reportsIssues: boolean;
}

/** `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}`: "Substituted only in plugin skills". */
const PLUGIN_ONLY = ['CLAUDE_PLUGIN_ROOT', 'CLAUDE_PLUGIN_DATA'] as const;
/** The two a synced skill does not get in a session on the owner's machine. */
const SESSION_BOUND = ['CLAUDE_PROJECT_DIR', 'CLAUDE_SESSION_ID'] as const;

/**
 * Where a skill's relative `dir` starts, per origin. Judgment: the docs name the folders of a
 * skill (`~/.claude/skills/`, `.claude/skills/`, the plugin folder), not how a host stores the
 * relative path; the kit reads it from the folder that holds the skills of that origin, and a
 * synced skill from the home folder like a personal one.
 */
const ROOTS: {
  readonly [K in SkillOriginKind]: (locations: Locations, pluginId: string) => string;
} = {
  plugin: (locations, pluginId) => locations.pluginRoot(pluginId),
  user: (locations) => locations.homeDir(),
  project: (locations) => locations.projectDir(),
  synced: (locations) => locations.homeDir(),
};

const ABSOLUTE = /^(?:[/\\]|[A-Za-z]:[/\\])/;

/** The plugin an origin belongs to, if it is a plugin's. */
const pluginOf = (origin: SkillOrigin): string | undefined =>
  'plugin' in origin ? origin.plugin : undefined;

/** Anything with an origin; a `Command` has no folder of its own. */
export type VariableSource = Pick<Skill | Command, 'origin'> & { readonly dir?: string };

/**
 * `${CLAUDE_SKILL_DIR}`: "the directory containing the skill's SKILL.md ... For plugin skills,
 * this is the skill's subdirectory within the plugin, not the plugin root". A command file has no
 * `SKILL.md` and the docs name no folder for it, so its placeholder stays as written (judgment).
 */
function skillDirectory(
  source: VariableSource,
  session: SkillSession,
  ports: SkillVariablePorts,
  pluginId: string,
): string | undefined {
  const { dir } = source;
  if (dir === undefined) return undefined;
  const { locations } = ports;
  const root = session.skillRoot ?? ROOTS[source.origin.kind](locations, pluginId);
  if (ABSOLUTE.test(dir)) return dir;
  return dir === '.' ? root : locations.joinPath(root, dir);
}

const forwardSlashes = (path: string): string => path.replaceAll('\\', '/');

/** The variables a skill adds to the shared scope (`scope.extra`). */
function extraVariables(
  session: SkillSession,
  skillDir: string | undefined,
): Readonly<Record<string, string>> {
  const windows = session.windows === true;
  return {
    CLAUDE_SESSION_ID: session.sessionId,
    ...(session.effort === undefined ? {} : { CLAUDE_EFFORT: session.effort }),
    ...(skillDir === undefined
      ? {}
      : { CLAUDE_SKILL_DIR: windows ? forwardSlashes(skillDir) : skillDir }),
  };
}

/** The names this origin and session leave as written. */
function literalNames(origin: SkillOrigin, session: SkillSession): readonly string[] {
  const traits = ORIGIN_TRAITS[origin.kind];
  const sessionBound = traits.substitutesSessionVariables || session.isolatedSession === true;
  return [
    ...(traits.substitutesPluginVariables ? [] : PLUGIN_ONLY),
    ...(sessionBound ? [] : SESSION_BOUND),
  ];
}

/** The scope `loading/resolve` substitutes in, and the names this skill leaves as written. */
export function buildVariables(
  source: VariableSource,
  session: SkillSession,
  ports: SkillVariablePorts,
): SkillVariables {
  const pluginId = session.pluginId ?? pluginOf(source.origin) ?? '';
  const skillDir = skillDirectory(source, session, ports, pluginId);
  return {
    scope: {
      pluginId,
      locations: ports.locations,
      environment: ports.environment,
      userConfig: session.userConfig ?? { declared: {}, values: {} },
      windows: session.windows === true,
      extra: extraVariables(session, skillDir),
      ...(session.signal === undefined ? {} : { signal: session.signal }),
    },
    literal: literalNames(source.origin, session),
    reportsIssues: ORIGIN_TRAITS[source.origin.kind].substitutesPluginVariables,
  };
}

export interface VariablesSubstituted {
  readonly text: string;
  /** Warnings from the shared substitution, for a plugin skill only. */
  readonly issues: readonly PluginIssue[];
}

/** A reference to one of the names, with the optional `:-default` the shared grammar reads. */
const referenceTo = (names: readonly string[]): RegExp =>
  new RegExp(`(\\$\\{(?:${names.join('|')})(?::-[^{}]*)?\\})`);

/**
 * `${CLAUDE_*}` in `text`, in one pass (a value is never scanned again). A reference this skill
 * leaves as written splits the text: the pieces between are substituted, the reference is kept.
 * Used for the skill's Markdown; `substituteAllowedTools` runs it over the Bash rules of
 * `allowed-tools`.
 */
export async function substituteVariables(
  text: string,
  vars: SkillVariables,
  path = '',
): Promise<VariablesSubstituted> {
  const pieces = vars.literal.length === 0 ? [text] : text.split(referenceTo(vars.literal));
  const run = substituter(vars.scope);
  const done = await Promise.all(
    pieces.map((piece, index) =>
      // The odd pieces are the references the split kept.
      index % 2 === 1
        ? Promise.resolve({ text: piece, issues: [] })
        : run.run(piece, SURFACE_POLICY['markdown-content'], path),
    ),
  );
  return {
    text: done.map((piece) => piece.text).join(''),
    issues: vars.reportsIssues ? done.flatMap((piece) => piece.issues) : [],
  };
}

/** A Bash rule: the only rules of `allowed-tools` skills.md says are substituted. */
const BASH_RULE = /^\s*Bash\s*\(/;

export interface AllowedToolsSubstituted {
  /** The rules of `allowed-tools`, in order, the Bash ones with their `${CLAUDE_*}` replaced. */
  readonly rules: readonly string[];
  readonly issues: readonly PluginIssue[];
}

/**
 * The `allowed-tools` of a skill with `${CLAUDE_*}` replaced in its Bash rules (skills.md: the rule
 * "then matches the exact command the skill body tells Claude to run"). Any other rule is kept as
 * written. The host passes the result on to the rule matcher.
 */
export async function substituteAllowedTools(
  skill: Pick<Skill, 'allowedTools'>,
  vars: SkillVariables,
  path = 'allowed-tools',
): Promise<AllowedToolsSubstituted> {
  const done = await Promise.all(
    skill.allowedTools.map((rule) =>
      BASH_RULE.test(rule)
        ? substituteVariables(rule, vars, path)
        : Promise.resolve({ text: rule, issues: [] }),
    ),
  );
  return {
    rules: done.map((rule) => rule.text),
    issues: done.flatMap((rule) => rule.issues),
  };
}
