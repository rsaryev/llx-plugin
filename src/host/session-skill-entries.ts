import type { FolderSource, PluginSource } from '../format/component-source.ts';
import type { BodyReader, InvocableHead } from '../format/skill-types.ts';
import type { Locations } from '../ports/index.ts';
import { type ScanScope } from '../skills/index.ts';
import type { ActivePlugin, HostState } from './state.ts';
import { skillPathIn } from '../skills/variables.ts';

/** The host gave the skill itself (`SessionOptions.hostSkills`): a bundled skill of the host. */
export interface HostSource {
  readonly kind: 'host';
}

/**
 * Where a skill came from: a plugin, a folder scope (skills.md, "Choose where skills load"), or the
 * host; the plugin and folder shapes are the ones agent rows share (`format/component-source`).
 */
export type SkillSource = PluginSource | FolderSource<ScanScope> | HostSource;

/** Where a skill lives, as the host writes paths: absolute, each absent when the skill has none. */
export interface SkillPlace {
  /** The `SKILL.md` or the command file. An inline manifest command has none. */
  readonly file?: string;
  /** The skill's folder, the value of `${CLAUDE_SKILL_DIR}`. A command has none. */
  readonly directory?: string;
}

/** One skill or command of the session, without its body, with every name that invokes it. */
export interface Entry extends SkillPlace {
  /** The skill or command without its body: the session reads the body when it runs (`readBody`). */
  readonly invocable: InvocableHead;
  /** Every name that invokes it, the listed command first. */
  readonly names: readonly string[];
  readonly readBody: BodyReader;
  readonly source: SkillSource;
  /** The plugin it belongs to, for a plugin's skill. */
  readonly plugin?: ActivePlugin;
}

/**
 * A skill's place: its path and folder below the plugin's `root` (`skillPathIn`, the rule of
 * `${CLAUDE_SKILL_DIR}`), or as the scan or the host wrote them, already absolute, without one.
 */
export function placeOf(
  invocable: InvocableHead,
  below?: { readonly root: () => string; readonly locations: Pick<Locations, 'joinPath'> },
): SkillPlace {
  const at = (path: string) =>
    below === undefined ? path : skillPathIn(below.root(), path, below.locations);
  const { path } = invocable;
  return {
    ...(path === undefined ? {} : { file: at(path) }),
    ...('dir' in invocable ? { directory: at(invocable.dir) } : {}),
  };
}

const folderName = (dir: string): string =>
  dir.slice(Math.max(dir.lastIndexOf('/'), dir.lastIndexOf('\\')) + 1);

/**
 * The name a plugin skill's frontmatter `name` also gives it without the plugin prefix: "The bare
 * `/fancy` also invokes the skill unless another command already uses that name" (skills.md, "How a
 * skill gets its command name"). A skill that keeps its folder's name has no bare name (judgment: the
 * docs state it for a `name`), and neither has a plugin's root `SKILL.md`. A skill its folder named
 * despite a `name` takes the bare part of its `declaredCommand` (oracle 2.1.322).
 */
function bareName(invocable: InvocableHead): string | undefined {
  const { origin } = invocable;
  if (!('plugin' in origin) || origin.rootSkill === true || !('dir' in invocable)) return undefined;
  const named = invocable.declaredCommand ?? invocable.command;
  const bare = named.slice(`${origin.plugin}:`.length);
  return bare === folderName(invocable.dir) ? undefined : bare;
}

/** The listed command, then the command a frontmatter `name` gives (`Skill.declaredCommand`). */
const commandsOf = (invocable: InvocableHead): string[] =>
  'declaredCommand' in invocable && invocable.declaredCommand !== undefined
    ? [invocable.command, invocable.declaredCommand]
    : [invocable.command];

/** The plugin's root, asked of the port once per plugin, when its first path needs it. */
function rootOf(plugin: ActivePlugin, locations: Locations): () => string {
  let root: string | undefined;
  return () => {
    root ??= locations.pluginRoot(plugin.id);
    return root;
  };
}

const ENTRIES = new WeakMap<HostState, readonly Entry[]>();

/**
 * The plugins' skills and commands of one host generation, built once for it: the plugin root of
 * each is asked of the state's `Locations` here, so a catalog read after it calls no port.
 */
export function entriesOf(state: HostState): readonly Entry[] {
  const cached = ENTRIES.get(state);
  if (cached !== undefined) return cached;
  const { locations } = state.options.ports;
  // Oracle 2.1.319: a command, not a skill, wins a plugin-local name collision.
  const entries = state.active.flatMap((plugin) => {
    const commands = new Set(plugin.catalog.commands.map((command) => command.command));
    const skills = plugin.catalog.skills.filter((skill) => !commands.has(skill.command));
    const root = rootOf(plugin, locations);
    const source: SkillSource = { kind: 'plugin', pluginId: plugin.id };
    // A plugin's Markdown is read at load (`readCatalog`), so its body is already in hand.
    // The body stays behind `readBody`: the entry holds the head, as a folder entry does.
    return [...skills, ...plugin.catalog.commands].map(({ body, ...invocable }): Entry => ({
      plugin,
      invocable,
      names: commandsOf(invocable),
      readBody: () => Promise.resolve(body),
      source,
      ...placeOf(invocable, { root, locations }),
    }));
  });
  const used = new Set(entries.map((entry) => entry.invocable.command));
  const named = entries.map((entry) => {
    const bare = bareName(entry.invocable);
    if (bare === undefined || used.has(bare)) return entry;
    used.add(bare);
    return { ...entry, names: [...entry.names, bare] };
  });
  ENTRIES.set(state, named);
  return named;
}
