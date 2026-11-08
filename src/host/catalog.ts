import { readAgent } from '../format/agent.ts';
import type { CommandEntry } from '../format/manifest-schema.ts';
import type { AgentRecord } from '../format/agent-record.ts';
import { readCommand, readCommandEntry } from '../format/command.ts';
import type { PluginIssue } from '../format/issues.ts';
import { readOutputStyle, type OutputStyle } from '../format/output-style.ts';
import { readSkill } from '../format/skill.ts';
import type { Command, Skill, SkillOrigin } from '../format/skill-types.ts';
import type { Plugin, PluginTextFile } from '../loading/index.ts';
import { commandEntryGrants } from '../skills/index.ts';

/** What one plugin's Markdown components read to: the formats' own readers, once, at load. */
export interface PluginCatalog {
  readonly skills: readonly Skill[];
  readonly commands: readonly Command[];
  readonly agents: readonly AgentRecord[];
  readonly outputStyles: readonly OutputStyle[];
  readonly issues: readonly PluginIssue[];
}

/** `db:migrate` is the file `db/migrate.md` below its folder. */
const relativePath = (file: PluginTextFile): string => `${file.name.split(':').join('/')}.md`;

const pathOf = (file: PluginTextFile, folder: string): string =>
  file.path ?? `${folder}/${relativePath(file)}`;

/** The plugin's own `SKILL.md` has no skill folder: its directory is the plugin root. */
const originOf = (plugin: Plugin, rootSkill = false): SkillOrigin =>
  rootSkill
    ? { kind: 'plugin', plugin: plugin.name, rootSkill }
    : { kind: 'plugin', plugin: plugin.name };

function readSkills(plugin: Plugin) {
  const reads = plugin.skills.map((file) =>
    readSkill(pathOf(file, 'skills'), file.text, {
      origin: originOf(plugin, file.directory === '.'),
      dirName: file.name,
    }),
  );
  return { skills: reads.map((read) => read.skill), issues: reads.flatMap((read) => read.issues) };
}

/**
 * A manifest command entry, read as `loadCommandEntries` reads it: the rules of `allowedTools` that
 * do not parse are dropped with a warning and grant nothing, and the command still loads.
 */
function readEntry(plugin: Plugin, file: PluginTextFile, entry: CommandEntry) {
  const grants =
    entry.allowedTools === undefined
      ? undefined
      : commandEntryGrants(file.name, entry.allowedTools);
  const checked = grants === undefined ? entry : { ...entry, allowedTools: [...grants.rules] };
  const read = readCommandEntry(
    file.name,
    checked,
    entry.source === undefined ? undefined : file.text,
    { origin: originOf(plugin) },
  );
  return { ...read, issues: [...(grants?.issues ?? []), ...read.issues] };
}

function readCommands(plugin: Plugin) {
  const reads = plugin.commands.map((file) =>
    file.entry === undefined
      ? readCommand(pathOf(file, 'commands'), file.text, {
          origin: originOf(plugin),
          relativePath: relativePath(file),
        })
      : readEntry(plugin, file, file.entry),
  );
  return {
    commands: reads.flatMap((read) => read.command ?? []),
    issues: reads.flatMap((read) => read.issues),
  };
}

function readAgents(plugin: Plugin) {
  const reads = plugin.agents.map((file) =>
    readAgent(file.text, {
      path: pathOf(file, 'agents'),
      source: 'plugin',
      plugin: { name: plugin.name, relativePath: relativePath(file) },
    }),
  );
  return {
    agents: reads.flatMap((read) => read.agent ?? []),
    issues: reads.flatMap((read) => read.issues),
  };
}

function readStyles(plugin: Plugin) {
  const reads = plugin.outputStyles.map((file) =>
    readOutputStyle(pathOf(file, 'output-styles'), file.text, { plugin: plugin.name }),
  );
  return {
    outputStyles: reads.map((read) => read.style),
    issues: reads.flatMap((read) => read.issues),
  };
}

/** One reading per `Plugin` object: it holds no key, so a plugin the host drops frees its catalog. */
const READ = new WeakMap<Plugin, PluginCatalog>();

/**
 * Reads the skills, commands, agents and output styles of a loaded plugin with the format readers.
 * Judgment (spec/judgments.md): the catalog is cached by the identity of the `Plugin` object, which
 * is immutable, so a host update that keeps a plugin does not read its Markdown again; a new
 * object, even for the same id, is read.
 */
export function readCatalog(plugin: Plugin): PluginCatalog {
  const cached = READ.get(plugin);
  if (cached !== undefined) return cached;
  const catalog = readPlugin(plugin);
  READ.set(plugin, catalog);
  return catalog;
}

function readPlugin(plugin: Plugin): PluginCatalog {
  const skills = readSkills(plugin);
  const commands = readCommands(plugin);
  const agents = readAgents(plugin);
  const styles = readStyles(plugin);
  return {
    skills: skills.skills,
    commands: commands.commands,
    agents: agents.agents,
    outputStyles: styles.outputStyles,
    issues: [...skills.issues, ...commands.issues, ...agents.issues, ...styles.issues],
  };
}
