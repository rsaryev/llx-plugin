import { error } from '../format/issues.ts';
import type { SlashCommand } from '../protocol/official.ts';
import { createSkillSettingsPolicy } from '../settings/skills/index.ts';
import {
  checkInvocation,
  expandSkill,
  menuEntries,
  modelListing,
  type Expansion,
  type Invoker,
  type ListingOptions,
  type ModelListingResult,
  type ShellPermission,
} from '../skills/index.ts';
import type { HookSessionGates } from '../settings/hooks/index.ts';
import { currentOf, type SessionCore } from './session-core.ts';
import type { SkillHooksRegistrar } from './session-hooks.ts';
import { entriesOf, invocablesOf, type Entry } from './session-skill-entries.ts';
import { skillHookRegistration, withHooks } from './session-skill-hooks.ts';
import type { SessionOptions } from './session-types.ts';
import type { SessionContent } from './session-content.ts';
import type { FolderSkillSources, SkillsReload } from './session-folders.ts';
import type { ExpandSession } from '../skills/index.ts';
import type { HostState } from './state.ts';

/** Who asks for the skill: the user typing `/name`, or the model calling it. */
export type SkillInvoker = Extract<Invoker, 'user' | 'model'>;

export interface ExpandOptions {
  /** What follows the name: `$ARGUMENTS`, `$0`, `$name`. Default none. */
  readonly arguments?: string;
  readonly signal: AbortSignal;
  /** Default `user`: the skill is checked against `user-invocable`; `model` against `disable-model-invocation`. */
  readonly invoker?: SkillInvoker;
  readonly bashOutputMaxChars?: number;
  readonly bare?: boolean;
  /**
   * The user's message names this skill after plain text (`go ahead and /deploy`): for the model's
   * invocation in that message it lifts `disable-model-invocation` (skills.md, "Where you write the
   * skill's name"). `session.expandMessage` says which names the message permits.
   */
  readonly permittedByMention?: boolean;
}

/** What the model is told and what the `/` menu offers; `usage`, `activated` and the budget as `modelListing`. */
export type SkillsOptions = Omit<ListingOptions, 'overrides'>;

export interface SkillsListing {
  readonly model: ModelListingResult;
  readonly menu: readonly SlashCommand[];
}

export interface SkillPart {
  skills(options?: SkillsOptions): SkillsListing;
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
  touchFile(path: string, options: { readonly signal: AbortSignal }): Promise<SkillsReload>;
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
}

/** Without an answer from the host a shell placeholder asks, and an `ask` aborts the expansion (skills.md, "Permission checks on injected commands"). */
const ASKS: ShellPermission = () => 'ask';

/** The session effort `${CLAUDE_EFFORT}` falls back to, and the model limits, of the turn. */
const turnLimits = (options: SessionOptions) => ({
  ...(options.effort === undefined ? {} : { effort: options.effort.level }),
  ...(options.limits === undefined ? {} : { limits: options.limits }),
});

function failed(name: string, message: string): Expansion {
  return { ok: false, issues: [error(`/${name}`, message)] };
}

/**
 * `allowManagedPermissionRulesOnly` (settings-reference.md; Scope: Managed, Boolean): when managed
 * settings set it, a skill's `allowed-tools` from a project, personal, synced or skills-directory
 * source is ignored (skills.md, "When only managed permission rules apply"). Judgment: only a managed
 * layer counts, the parent settings of an embedding host do not (spec/judgments.md).
 */
const managedPermissionRulesOnly = (state: HostState): boolean =>
  state.view.layers.some(
    (layer) => layer.scope === 'managed' && layer.settings.allowManagedPermissionRulesOnly === true,
  );

function shellDisabled(state: HostState): boolean {
  const policy = createSkillSettingsPolicy(state.view, {
    ...state.parent,
    env: state.options.ports.environment.snapshot(),
  });
  return !policy.shell('plugin').run;
}

/** What one use of the skill part reads: the current state and gates, and the turn's options. */
interface Use {
  readonly state: HostState;
  readonly gates: HookSessionGates;
  readonly options: SessionOptions;
}

function expansionOf(use: Use, entry: Entry, request: ExpandOptions): Promise<Expansion> {
  const { state, gates, options } = use;
  const { ports } = state.options;
  const windows = state.options.windows ?? false;
  const invoker = request.invoker ?? 'user';
  return expandSkill(
    entry.invocable,
    {
      arguments: request.arguments ?? '',
      sessionId: options.sessionId,
      ...turnLimits(options),
      permissionMode: options.permissionMode,
      disableShellExecution: shellDisabled(state),
      shells: state.options.shells ?? { bash: true, powershell: windows },
      context: { interactive: options.interactive ?? true, trigger: invoker },
      session: skillSession(entry, windows),
      policy: {
        hooksLockedToPlugins: gates.pluginOnlyHooks,
        managedPermissionRulesOnly: managedPermissionRulesOnly(state),
      },
      cwd: options.cwd,
      ...(request.bashOutputMaxChars === undefined
        ? {}
        : { bashOutputMaxChars: request.bashOutputMaxChars }),
      ...(request.bare === undefined ? {} : { bare: request.bare }),
      signal: request.signal,
    },
    {
      runner: ports.commands,
      locations: ports.locations,
      environment: ports.environment,
      permissions: options.permissions ?? ASKS,
      ...(ports.scratch === undefined ? {} : { scratch: ports.scratch }),
    },
  );
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
  const allEntries = () => [...entriesOf(currentOf(core).state), ...content.folders.current()];
  return {
    skills: (listing = {}) => {
      const { state } = currentOf(core);
      const invocables = invocablesOf(allEntries());
      const overrides = state.view.get('skillOverrides');
      return {
        model: modelListing(invocables, { ...listing, ...(overrides && { overrides }) }),
        menu: menuEntries(invocables, overrides === undefined ? {} : { overrides }),
      };
    },
    reloadSkills: ({ signal }) => content.folders.reload(signal),
    touchFile: (path, { signal }) => content.folders.touch(path, signal),
    addDirectory: (path, { signal }) => content.folders.addDirectory(path, signal),
    moveTo: (cwd, { signal }) => content.folders.moveTo(cwd, signal),
    skillSources: () => content.folders.sources(),
    async expandSkill(name, request) {
      const { state, gates } = currentOf(core);
      const all = allEntries();
      const entry =
        all.find((each) => each.invocable.command === name) ??
        all.find((each) => each.names.includes(name));
      if (entry === undefined) return failed(name, `Unknown skill: ${name}`);
      const verdict = checkInvocation(
        entry.invocable,
        request.invoker ?? 'user',
        state.view.get('skillOverrides'),
        { permittedByMention: request.permittedByMention === true },
      );
      if (!verdict.allowed) return failed(name, verdict.message);
      const expansion = await expansionOf(
        { state, gates, options: { ...options, cwd: content.directories.cwd() } },
        entry,
        request,
      );
      return withHooks(expansion, (hooks) => addHooks(entry, hooks));
    },
  };
}

/** Folder skills have no plugin substitutions; plugin skills retain their configuration. */
function skillSession(entry: Entry, windows: boolean): ExpandSession {
  const plugin = entry.plugin;
  return plugin === undefined
    ? { windows }
    : {
        pluginId: plugin.id,
        userConfig: plugin.userConfig,
        windows,
        ...(plugin.source === undefined ? {} : { pluginSource: plugin.source }),
      };
}
