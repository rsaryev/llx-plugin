/**
 * Fixtures of the host update tests: small plugins written for this suite (a skill, a hook, an
 * agent or a server each), loaded through the real loader, and a host over fakes that has none.
 */
import type { HostPlugin } from '../../src/host/index.ts';
import type { Plugin } from '../../src/loading/index.ts';
import type { HooksSettings } from '../../src/protocol/hook-config.ts';
import { loaded } from './host.ts';

const json = (value: unknown): string => JSON.stringify(value);

export interface PluginParts {
  /** Skill name to body: `skills/<name>/SKILL.md` with the given frontmatter lines. */
  readonly skills?: Readonly<Record<string, string>>;
  /** The `hooks` of `hooks/hooks.json`. */
  readonly hooks?: unknown;
  /** Agent name to its prompt. */
  readonly agents?: Readonly<Record<string, string>>;
  /** The `.mcp.json` servers. */
  readonly mcpServers?: unknown;
  readonly userConfig?: unknown;
}

/** The plugin `name` with the parts given; every part is a file the loader reads. */
export async function pluginOf(name: string, parts: PluginParts = {}): Promise<Plugin> {
  const files: Record<string, string> = {
    '.claude-plugin/plugin.json': json({
      name,
      ...(parts.userConfig === undefined ? {} : { userConfig: parts.userConfig }),
    }),
  };
  for (const [skill, text] of Object.entries(parts.skills ?? {})) {
    files[`skills/${skill}/SKILL.md`] = text;
  }
  for (const [agent, prompt] of Object.entries(parts.agents ?? {})) {
    files[`agents/${agent}.md`] =
      `---\nname: ${agent}\ndescription: ${agent} agent\n---\n${prompt}`;
  }
  if (parts.hooks !== undefined) files['hooks/hooks.json'] = json({ hooks: parts.hooks });
  if (parts.mcpServers !== undefined) files['.mcp.json'] = json({ mcpServers: parts.mcpServers });
  return loaded(files);
}

/** A skill file whose body is `text`, with the extra frontmatter lines. */
export const skillText = (text: string, frontmatter: readonly string[] = []): string =>
  ['---', `description: ${text}`, ...frontmatter, '---', text].join('\n');

/** `PreToolUse` hooks for `Bash` that run `command`, in the shape of a hooks file. */
export const bashGuard = (command: string): HooksSettings => ({
  PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command }] }],
});

export const hostPlugin = (id: string, plugin: Plugin, enabled?: boolean): HostPlugin => ({
  id,
  plugin,
  ...(enabled === undefined ? {} : { enabled }),
});

export const BASH = { tool_name: 'Bash', tool_input: { command: 'ls' }, tool_use_id: 't1' };

/** The commands the runner ran, in order. */
export const commandsRun = (runner: {
  calls: readonly { spec: { command?: string } }[];
}): readonly (string | undefined)[] => runner.calls.map((call) => call.spec.command);
