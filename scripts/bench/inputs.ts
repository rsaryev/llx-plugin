/**
 * The meter's inputs, generated in memory from fixed parameters: no corpus, no disk, no clock and
 * no randomness, so a size gives the same bytes every time. Indices are written at a fixed width
 * (`0007`), so a size twice as big is exactly twice the text. `salt` makes the text of one
 * measurement its own, so a memo the kit keeps across calls (a compiled pattern) is never warm from
 * another measurement.
 */
import type { HooksSettings } from '../../src/index.ts';

const json = (value: unknown): string => JSON.stringify(value);
const at = (index: number): string => String(index).padStart(4, '0');
const range = (count: number): number[] => Array.from({ length: count }, (_, index) => index);

/** The shape of a generated plugin: how many of each component. */
export interface PluginShape {
  readonly name: string;
  readonly skills?: number;
  readonly commands?: number;
  readonly agents?: number;
  /** `PreToolUse` command hooks, each a group of its own with `matcher`. */
  readonly hooks?: number;
  /** The tool name the hooks match; default `Write`. */
  readonly matcher?: string;
  readonly mcpServers?: number;
}

const skillFile = (name: string, index: number): string =>
  [
    '---',
    `description: Skill ${at(index)} of ${name}`,
    'argument-hint: <path>',
    '---',
    `Review $ARGUMENTS with the rules in \${CLAUDE_PLUGIN_ROOT}/rules-${at(index)}.md.`,
  ].join('\n');

const commandFile = (index: number): string =>
  `---\ndescription: Command ${at(index)}\n---\nRun step ${at(index)} on $ARGUMENTS.`;

const agentFile = (index: number): string =>
  [
    '---',
    `name: agent-${at(index)}`,
    `description: Agent ${at(index)} reviews diffs`,
    'tools: Read, Grep',
    '---',
    `You are agent ${at(index)}.`,
  ].join('\n');

function hooksOf(shape: PluginShape): HooksSettings {
  const matcher = shape.matcher ?? 'Write';
  return {
    PreToolUse: range(shape.hooks ?? 0).map((index) => ({
      matcher,
      hooks: [{ type: 'command', command: `\${CLAUDE_PLUGIN_ROOT}/hooks/guard-${at(index)}.sh` }],
    })),
  };
}

const serversOf = (count: number) =>
  Object.fromEntries(
    range(count).map((index) => [
      `server-${at(index)}`,
      { command: '${CLAUDE_PLUGIN_ROOT}/bin/server', args: ['--port', at(index)] },
    ]),
  );

/** The files of a plugin of `shape`, as `memoryFiles` takes them. */
export function pluginFiles(shape: PluginShape): Record<string, string> {
  const files: Record<string, string> = {
    '.claude-plugin/plugin.json': json({
      name: shape.name,
      version: '1.0.0',
      description: `The ${shape.name} plugin`,
    }),
  };
  for (const index of range(shape.skills ?? 0)) {
    files[`skills/skill-${at(index)}/SKILL.md`] = skillFile(shape.name, index);
  }
  for (const index of range(shape.commands ?? 0)) {
    files[`commands/command-${at(index)}.md`] = commandFile(index);
  }
  for (const index of range(shape.agents ?? 0)) {
    files[`agents/agent-${at(index)}.md`] = agentFile(index);
  }
  if ((shape.hooks ?? 0) > 0) files['hooks/hooks.json'] = json({ hooks: hooksOf(shape) });
  if ((shape.mcpServers ?? 0) > 0) {
    files['.mcp.json'] = json({ mcpServers: serversOf(shape.mcpServers ?? 0) });
  }
  return files;
}

/**
 * A plugin of one skill with no `description` and a body of `lines` lines: the listing falls back
 * to the first non-empty line, which is the first one.
 */
export const undescribedSkill = (name: string, lines: number): Record<string, string> => ({
  '.claude-plugin/plugin.json': json({ name, version: '1.0.0' }),
  'skills/long/SKILL.md': [
    '---',
    'argument-hint: <path>',
    '---',
    ...range(lines).map((index) => `Step ${at(index)}: review $ARGUMENTS.`),
  ].join('\n'),
});

/** The name of plugin `index` of a measurement. */
export const pluginName = (salt: string, index: number): string => `p${salt}-${at(index)}`;

/** `count` permission rules of each kind the scenarios check (Bash, Read, Edit), interleaved, none matching. */
export function permissionRules(salt: string, count: number): string[] {
  return range(count).flatMap((index) => [
    `Bash(tool${salt}${at(index)} *)`,
    `Read(/srv/${salt}/${at(index)}/**)`,
    `Edit(/srv/${salt}/${at(index)}/*.ts)`,
  ]);
}

/** A Bash command line of `words` words in pipes of four. */
export function bashCommand(salt: string, words: number): string {
  return range(words)
    .map((index) =>
      index % 4 === 0 && index > 0 ? `| w${salt}${at(index)}` : `w${salt}${at(index)}`,
    )
    .join(' ');
}

/** One settings file of `rules` permission rules of each kind and as many `env` entries. */
export function settingsFile(salt: string, scope: string, rules: number): string {
  return json({
    permissions: { allow: permissionRules(`${salt}${scope}`, rules) },
    env: Object.fromEntries(
      range(rules).map((index) => [`VAR_${at(index)}`, `${scope}-${at(index)}`]),
    ),
  });
}
