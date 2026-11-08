import { error, warning, type PluginIssue } from '../format/issues.ts';
import type { Command, Skill } from '../format/skill-types.ts';
import type { SlashCommand } from '../protocol/official.ts';
import { hookSessionGates } from '../settings/hooks/index.ts';
import { createSkillSettingsPolicy } from '../settings/skills/index.ts';
import { registerHooks, type RegisteredHandler } from '../hooks/index.ts';
import {
  admitSkillHooks,
  checkInvocation,
  expandSkill,
  hookSourceOf,
  NO_HOOKS_YET,
  type HookUsage,
  menuEntries,
  modelListing,
  type ExpandPorts,
  type ExpandSession,
  type Expansion,
  type Invocable,
  type Invoker,
  type ListingOptions,
  type ModelListingResult,
  type ShellPermission,
} from '../skills/index.ts';
import type { SessionDirectories } from './session-directories.ts';
import {
  createFolderSkills,
  type FolderEntry,
  type FolderSkillSources,
  type SkillsReload,
} from './session-folders.ts';
import type { SkillHooksRegistrar } from './session-hooks.ts';
import type { ActivePlugin, HostState } from './state.ts';
import type { SessionOptions } from './types.ts';

/** Who asks for the skill: the user typing `/name`, or the model calling it. */
export type SkillInvoker = Extract<Invoker, 'user' | 'model'>;

export interface ExpandOptions {
  /** What follows the name: `$ARGUMENTS`, `$0`, `$name`. Default none. */
  readonly arguments?: string;
  readonly signal: AbortSignal;
  /** Default `user`: the skill is checked against `user-invocable`; `model` against `disable-model-invocation`. */
  readonly invoker?: SkillInvoker;
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

/** A plugin's skill or command, or one of the folders' (`plugin` absent). */
interface Entry extends FolderEntry {
  readonly plugin?: ActivePlugin;
}

/** Without an answer from the host a shell placeholder asks, and an `ask` aborts the expansion (skills.md, "Permission checks on injected commands"). */
const ASKS: ShellPermission = () => 'ask';

const folderName = (dir: string): string =>
  dir.slice(Math.max(dir.lastIndexOf('/'), dir.lastIndexOf('\\')) + 1);

/**
 * The name a plugin skill's frontmatter `name` also gives it without the plugin prefix: "The bare
 * `/fancy` also invokes the skill unless another command already uses that name" (skills.md, "How a
 * skill gets its command name"). A skill that keeps its folder's name has no bare name (judgment: the
 * docs state it for a `name`), and neither has a plugin's root `SKILL.md`.
 */
function bareName(invocable: Skill | Command): string | undefined {
  const { origin } = invocable;
  if (!('plugin' in origin) || origin.rootSkill === true || !('dir' in invocable)) return undefined;
  const bare = invocable.command.slice(`${origin.plugin}:`.length);
  return bare === folderName(invocable.dir) ? undefined : bare;
}

function pluginEntries(state: HostState): readonly Entry[] {
  const entries = state.active.flatMap((plugin) =>
    [...plugin.catalog.skills, ...plugin.catalog.commands].map((invocable) => ({
      plugin,
      invocable,
      names: [invocable.command],
    })),
  );
  const used = new Set(entries.map((entry) => entry.invocable.command));
  return entries.map((entry) => {
    const bare = bareName(entry.invocable);
    if (bare === undefined || used.has(bare)) return entry;
    used.add(bare);
    return { ...entry, names: [...entry.names, bare] };
  });
}

/** What a hook's source is named after: the plugin, else where the skill lives (`user`, `project`). */
const ownerOf = (entry: Entry): string => entry.plugin?.id ?? entry.invocable.origin.kind;

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

/**
 * hooks.md, "Hooks in skills and agents": a skill's hooks are registered when it is invoked and
 * keep running for the rest of the session; "Limits on skill hooks": each source of skills registers
 * at most 1,024 hooks and 16,384 matcher characters per session, and a skill past the limit
 * "registers none of its hooks". Judgment: invoking a skill again replaces its own hooks and counts
 * them once (spec/judgments.md).
 */
function skillHookRegistration(registrar: SkillHooksRegistrar) {
  const used = new Map<string, HookUsage>();
  const counted = new Map<string, HookUsage>();
  return (
    entry: Entry,
    hooks: NonNullable<Extract<Expansion, { ok: true }>['hooks']>,
  ): readonly PluginIssue[] => {
    const source = hookSourceOf(entry.invocable.origin);
    const prefix = `skill:${ownerOf(entry)}:${entry.invocable.command}`;
    const others = used.get(source) ?? NO_HOOKS_YET;
    const own = counted.get(prefix) ?? NO_HOOKS_YET;
    const base = {
      hooks: others.hooks - own.hooks,
      matcherChars: others.matcherChars - own.matcherChars,
    };
    const admission = admitSkillHooks(base, hooks);
    if (!admission.admitted) {
      return [
        warning(
          `/${entry.invocable.command}`,
          `Skill "${entry.invocable.command}" registers none of its hooks: ${source} is past its limit of 1,024 hooks or 16,384 matcher characters`,
        ),
      ];
    }
    used.set(source, admission.used);
    counted.set(prefix, {
      hooks: admission.used.hooks - base.hooks,
      matcherChars: admission.used.matcherChars - base.matcherChars,
    });
    const entries: readonly RegisteredHandler[] = registerHooks(hooks, {
      idPrefix: prefix,
      source: { kind: 'skill', label: '[skill]' },
      ...(entry.plugin === undefined ? {} : { pluginId: entry.plugin.id }),
    });
    registrar.registerSkillHooks(prefix, entries);
    return [];
  };
}

/** What a skill's variables resolve against: its plugin's, or nothing but the platform for a folder's. */
const sessionOf = (entry: Entry, windows: boolean): ExpandSession =>
  entry.plugin === undefined
    ? { windows }
    : {
        pluginId: entry.plugin.id,
        userConfig: entry.plugin.userConfig,
        windows,
        ...(entry.plugin.source === undefined ? {} : { pluginSource: entry.plugin.source }),
      };

/** The expansion with the warnings of registering its hooks, when it has hooks to register. */
function withHooks(
  expansion: Expansion,
  register: (
    hooks: NonNullable<Extract<Expansion, { ok: true }>['hooks']>,
  ) => readonly PluginIssue[],
): Expansion {
  if (!expansion.ok || expansion.hooks === undefined) return expansion;
  const issues = register(expansion.hooks);
  return issues.length === 0
    ? expansion
    : { ...expansion, issues: [...expansion.issues, ...issues] };
}

export function createSkillPart(
  state: HostState,
  options: SessionOptions,
  parts: { readonly registrar: SkillHooksRegistrar; readonly directories: SessionDirectories },
): SkillPart {
  const { registrar, directories } = parts;
  const addHooks = skillHookRegistration(registrar);
  const { ports } = state.options;
  const windows = state.options.windows ?? false;
  const plugins = pluginEntries(state);
  const folders = createFolderSkills(state, directories, () => [
    ...(options.takenCommands ?? []),
    ...plugins.flatMap((entry) => entry.names),
  ]);
  const entries = (): readonly Entry[] => [...plugins, ...folders.current()];
  const overrides = state.view.get('skillOverrides');
  const hooksLocked = hookSessionGates(state.view, state.parent).pluginOnlyHooks;
  const expandPorts: ExpandPorts = {
    runner: ports.commands,
    locations: ports.locations,
    environment: ports.environment,
    permissions: options.permissions ?? ASKS,
  };
  return {
    skills: (listing = {}) => {
      const invocables: readonly Invocable[] = entries().map((entry) => entry.invocable);
      return {
        model: modelListing(invocables, { ...listing, ...(overrides && { overrides }) }),
        menu: menuEntries(invocables, overrides === undefined ? {} : { overrides }),
      };
    },
    reloadSkills: ({ signal }) => folders.reload(signal),
    touchFile: (path, { signal }) => folders.touch(path, signal),
    addDirectory: (path, { signal }) => folders.addDirectory(path, signal),
    moveTo: (cwd, { signal }) => folders.moveTo(cwd, signal),
    skillSources: () => folders.sources(),
    async expandSkill(name, request) {
      const all = entries();
      const entry =
        all.find((each) => each.invocable.command === name) ??
        all.find((each) => each.names.includes(name));
      if (entry === undefined) return failed(name, `Unknown skill: ${name}`);
      const invoker = request.invoker ?? 'user';
      const verdict = checkInvocation(entry.invocable, invoker, overrides);
      if (!verdict.allowed) return failed(name, verdict.message);
      const expansion = await expandSkill(
        entry.invocable,
        {
          arguments: request.arguments ?? '',
          sessionId: options.sessionId,
          ...(options.effort === undefined ? {} : { effort: options.effort.level }),
          permissionMode: options.permissionMode,
          disableShellExecution: shellDisabled(state),
          shells: state.options.shells ?? { bash: true, powershell: windows },
          context: { interactive: options.interactive ?? true, trigger: invoker },
          session: sessionOf(entry, windows),
          policy: {
            hooksLockedToPlugins: hooksLocked,
            managedPermissionRulesOnly: managedPermissionRulesOnly(state),
          },
          cwd: directories.cwd(),
          signal: request.signal,
        },
        expandPorts,
      );
      return withHooks(expansion, (hooks) => addHooks(entry, hooks));
    },
  };
}
