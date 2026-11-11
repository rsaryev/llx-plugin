import type { Command, Skill } from '../format/skill-types.ts';
import type { AgentDefinition, SlashCommand } from '../protocol/official.ts';
import {
  checkInvocation,
  menuEntries,
  modelListing,
  skillActivatesFor,
  skillLookup,
  type PathGateOptions,
  type Expansion,
  type ListingOptions,
  type ModelListingResult,
} from '../skills/index.ts';
import type { PluginIssue } from '../format/issues.ts';
import {
  catalogRows,
  type SkillCatalog,
  type SkillCatalogOptions,
} from './session-skill-catalog.ts';
import { hostSkillsOf } from './session-host-skills.ts';
import { currentOf, type SessionCore } from './session-core.ts';
import type { SkillHooksRegistrar } from './session-hooks.ts';
import { entriesOf, type Entry } from './session-skill-entries.ts';
import {
  contentOf,
  expansionOf,
  failed,
  INVOKER_OF,
  useOf,
  type ExpandOptions,
  type Failure,
} from './session-skill-expand.ts';
import { recordInvocation } from './session-monitors.ts';
import { skillHookRegistration, withHooks } from './session-skill-hooks.ts';
import type { SessionOptions } from './session-types.ts';
import type { SessionContent } from './session-content.ts';
import type { FolderSkillSources, SkillsReload } from './session-folders.ts';
import type { HostState } from './state.ts';
import { workflowCommandsOf, type WorkflowCommand } from './session-workflows.ts';
import { preloadFrom, type PreloadedSkills, type PreloadOptions } from './session-skill-preload.ts';

/** What the model is told and what the `/` menu offers; `usage`, `activated` and the budget as `modelListing`. */
export type SkillsOptions = Omit<ListingOptions, 'overrides'>;

export interface SkillsListing {
  readonly model: ModelListingResult;
  readonly menu: readonly SlashCommand[];
  /** The rows of `model` and `menu` that are a plugin's workflows: the host runs them as scripts. */
  readonly workflows: readonly WorkflowCommand[];
  /** As `skillCatalog().issues`: the listing is not whole before the first `reloadSkills`. */
  readonly issues: readonly PluginIssue[];
}

export interface SkillPart {
  /** `modelListing` and `menuEntries` over the rows of `skillCatalog`, with the plugins' workflows first. */
  skills(options?: SkillsOptions): SkillsListing;
  /**
   * Every skill and command the session can invoke, as `skills()`, `expandSkill`, `expandMessage` and
   * `preloadSkills` see them: each with every name that invokes it, its source, its frontmatter as
   * read, its `skillOverrides` state, who may invoke it, what the listing and the menu show, and its
   * file and directory. It calls no port: the folders are as the last read listed them, and until
   * the first `reloadSkills` (`addDirectory`, `moveTo`) `issues` says the folders are not read.
   */
  skillCatalog(options?: SkillCatalogOptions): SkillCatalog;
  /** Expands a skill; a successful expansion counts as the skill running for `monitorsToStart`. */
  expandSkill(name: string, options: ExpandOptions): Promise<Expansion>;
  /**
   * Reads the folders again: the managed directory, `~/.claude/skills` and `~/.claude/commands`, the
   * project and its parents, the added directories and the skills synced from claude.ai, and the
   * nested directories a touched file loaded. The first call is what lists them at all; later calls
   * are `/reload-skills`, which picks up a skills directory created during the session (skills.md,
   * "Edit a skill during a session"). Needs `HostPorts.folders`.
   */
  reloadSkills(options: { readonly signal: AbortSignal }): Promise<SkillsReload>;
  /**
   * Claude read or edited a file: the `.claude/skills` of the directories between the working
   * directory and the file load, once, and stay for the session (skills.md, "Load skills in
   * monorepos and subdirectories").
   */
  touchFile(path: string, options: { readonly signal: AbortSignal }): Promise<TouchedFile>;
  /**
   * `/add-dir`: the directory's `.claude/skills` and `.claude/commands` load now, after the ones added
   * before it (skills.md, "Load skills from a directory outside the project"). The session's skill
   * hooks, `once` keys and nested directories stay. Needs `HostPorts.folders`.
   */
  addDirectory(path: string, options: { readonly signal: AbortSignal }): Promise<SkillsReload>;
  /**
   * `/cd`: the new working directory's project skills load next to the added directories' (skills.md,
   * "Load skills in monorepos and subdirectories"), and hook input `cwd` follows it. The session goes
   * on as for `addDirectory` (spec/judgments.md). Needs `HostPorts.folders`.
   */
  moveTo(cwd: string, options: { readonly signal: AbortSignal }): Promise<SkillsReload>;
  /**
   * Where each folder skill the last read listed came from, and what name it gave up: the
   * `claude.ai sync` group of `/skills` and the note under it for a synced skill that lost its short
   * name (skills.md, "When a synced skill name matches another command").
   */
  skillSources(): FolderSkillSources;
  /**
   * The skills a subagent's `skills` field preloads (sub-agents.md, "Preload skills into subagents"),
   * found by every name a skill answers to, as `expandSkill` finds it. A skill Claude cannot invoke
   * (`disable-model-invocation`, a `skillOverrides` state) is skipped. The bodies are as written: no
   * substitution, no `!` command runs, and no tool is granted.
   */
  preloadSkills(
    definition: Pick<AgentDefinition, 'skills'>,
    options: PreloadOptions,
  ): Promise<PreloadedSkills>;
  /**
   * A named skill's or command's body as its file holds it now, with its absolute `path` and `dir`,
   * found by every name it answers to, as `expandSkill` finds it: for a host that pins a skill. None
   * of an invocation's steps: `disable-model-invocation` and `skillOverrides` do not apply, no `!`
   * command runs, nothing is substituted and no base-directory line is added (`withFolderLine`).
   * A workflow's name or an unknown one fails as `expandSkill` fails it.
   */
  skillContent(name: string, options: { readonly signal: AbortSignal }): Promise<SkillContent>;
  /**
   * Records that a skill or command ran without `expandSkill` (the host expanded or preloaded it
   * itself), so its `on-skill-invoke:<skill>` monitors are due at the next `monitorsToStart`. Found by
   * every name `expandSkill` finds it by; `false`, and nothing recorded, for a workflow or an unknown
   * name. No invocation check runs: the host says it ran.
   */
  recordSkillInvocation(name: string): boolean;
}

/** What `skillContent` read: the skill with its body, or why it could not. */
export type SkillContent = { readonly ok: true; readonly skill: Skill | Command } | Failure;

export interface TouchedFile extends SkillsReload {
  /**
   * The commands of the skills whose `paths` the file activated just now (skills.md, frontmatter
   * reference, `paths`). The session keeps them: `skills()` describes them from now on.
   */
  readonly activated: readonly string[];
}

/** The skills a touched file activated, for the session's life (every turn's view shares them). */
type Platform = NonNullable<PathGateOptions['platform']>;

const ACTIVATED = new WeakMap<SessionCore, Set<string>>();

function activatedOf(core: SessionCore): Set<string> {
  const known = ACTIVATED.get(core) ?? new Set<string>();
  ACTIVATED.set(core, known);
  return known;
}

/** Marks the path-scoped skills `path` activates; the ones it activated now. */
function activate(
  entries: readonly Entry[],
  known: Set<string>,
  touched: { readonly path: string; readonly cwd: string; readonly platform: Platform },
): string[] {
  const fresh = entries
    .map((entry) => entry.invocable)
    .filter(
      (invocable) =>
        invocable.paths.length > 0 &&
        !known.has(invocable.command) &&
        skillActivatesFor(invocable, touched.path, touched.cwd, { platform: touched.platform }),
    )
    .map((invocable) => invocable.command);
  for (const command of fresh) known.add(command);
  return fresh;
}

/** The entry a name invokes, as `expandSkill` and `skillContent` find it; a workflow is none. */
function entryIn(
  state: HostState,
  options: SessionOptions,
  entries: readonly Entry[],
  name: string,
): Entry | Failure {
  if (workflowCommandsOf(state, options).some((workflow) => workflow.name === name)) {
    return failed(name, `/${name} is a workflow: the host runs its script, it is not a skill`);
  }
  return skillLookup(entries).find(name) ?? failed(name, `Unknown skill: ${name}`);
}

/** Records a skill found by name for its monitors; a failed lookup records nothing. */
function recorded(core: SessionCore, entry: Entry | Failure): boolean {
  if ('ok' in entry) return false;
  recordInvocation(core, entry);
  return true;
}

/**
 * The skills of one turn: the cwd, effort, mode, interactivity and shell answer are the turn's, the
 * limits on skill hooks are the session's (`core`), so a skill invoked in an earlier turn still
 * counts and a later turn cannot register past them. The catalog, `skillOverrides`, the shell policy
 * and the plugin-only lock are read from the current state at each call, so `host.update` reaches a
 * session that is open.
 */
export function createSkillPart(
  core: SessionCore,
  options: SessionOptions,
  parts: { readonly registrar: SkillHooksRegistrar; readonly content: SessionContent },
): SkillPart {
  const { registrar, content } = parts;
  const addHooks = skillHookRegistration(registrar, core.skillHooks);
  const entryNamed = (name: string) => entryIn(currentOf(core).state, options, allEntries(), name);
  const allEntries = (): readonly Entry[] => {
    const { state } = currentOf(core);
    return [
      ...entriesOf(state),
      ...content.folders.current(),
      ...hostSkillsOf(state, options).entries,
    ];
  };
  const issuesOf = (): readonly PluginIssue[] => [
    ...content.folders.issues(),
    ...hostSkillsOf(currentOf(core).state, options).issues,
  ];
  /** The rows and what they were built from: the workflows, the overrides and the activated skills. */
  const catalog = (extra: ReadonlySet<string> = new Set()) => {
    const { state } = currentOf(core);
    const workflows = workflowCommandsOf(state, options);
    const overrides = state.view.get('skillOverrides');
    const activated = new Set([...activatedOf(core), ...extra]);
    // Oracle 2.1.319: a workflow keeps a name a skill or a command of its plugin also has.
    const taken = new Set(workflows.map((workflow) => workflow.name));
    const rows = catalogRows({ entries: allEntries(), workflows: taken, overrides, activated });
    return { rows, workflows, overrides, activated };
  };
  return {
    skills: (listing = {}) => {
      const { rows, workflows, overrides, activated } = catalog(listing.activated);
      const invocables = rows.map((row) => row.invocable);
      const listed = { ...listing, activated, ...(overrides && { overrides }) };
      return {
        model: modelListing(invocables, listed, workflows),
        menu: menuEntries(invocables, overrides === undefined ? {} : { overrides }, workflows),
        workflows,
        issues: issuesOf(),
      };
    },
    skillCatalog: (asked = {}) => ({ skills: catalog(asked.activated).rows, issues: issuesOf() }),
    reloadSkills: ({ signal }) => content.folders.reload(signal),
    async touchFile(path, { signal }) {
      const reload = await content.folders.touch(path, signal);
      const platform: Platform =
        currentOf(core).state.options.windows === true ? 'windows' : 'posix';
      const touched = { path, cwd: content.directories.cwd(), platform };
      return { ...reload, activated: activate(allEntries(), activatedOf(core), touched) };
    },
    addDirectory: (path, { signal }) => content.folders.addDirectory(path, signal),
    moveTo: (cwd, { signal }) => content.folders.moveTo(cwd, signal),
    skillSources: () => content.folders.sources(),
    preloadSkills: (definition, options) =>
      preloadFrom(allEntries(), currentOf(core).state, { ...options, definition }),
    async skillContent(name, { signal }) {
      const entry = entryNamed(name);
      if ('ok' in entry) return entry;
      const read = await contentOf(entry, signal);
      return 'ok' in read ? read : { ok: true, skill: read };
    },
    recordSkillInvocation: (name) => recorded(core, entryNamed(name)),
    async expandSkill(name, request) {
      const use = useOf(core, options, content.directories);
      const { state } = use;
      const entry = entryNamed(name);
      if ('ok' in entry) return entry;
      const verdict = checkInvocation(
        entry.invocable,
        INVOKER_OF[request.invoker ?? 'user'],
        state.view.get('skillOverrides'),
        { permittedByMention: request.permittedByMention === true },
      );
      if (!verdict.allowed) return failed(name, verdict.message);
      const expansion = await expansionOf(use, entry, request);
      if (expansion.ok) recorded(core, entry);
      return withHooks(expansion, (hooks) => addHooks(entry, hooks));
    },
  };
}
