import type { Rendered } from './result.ts';

/**
 * `claude plugin details <name>` (plugins/cli-reference.md, "plugin details"): the plugin's name,
 * version, description and source, then `Component inventory`, `Projected token cost` and
 * `Per-component (rounded)`; a plugin that is not loaded prints a message and exits `1`. Pure: the
 * host loads the plugin and estimates the tokens. The line layout is the kit's (spec/judgments.md);
 * the section names and the two messages are the docs'.
 */

export interface ComponentCost {
  readonly kind: 'skill' | 'agent' | 'command';
  readonly name: string;
  /** Tokens the component adds to every session. */
  readonly alwaysOn: number;
  /** Tokens it adds when invoked. */
  readonly onInvoke: number;
}

export interface PluginDetails {
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly source: string;
  /** The names of what the plugin contributes, by kind. */
  readonly inventory: {
    readonly skills: readonly string[];
    readonly agents: readonly string[];
    readonly hooks: readonly string[];
    readonly mcpServers: readonly string[];
    readonly lspServers: readonly string[];
  };
  /** The always-on tokens the plugin adds to every session. */
  readonly projectedTokens: number;
  readonly components: readonly ComponentCost[];
}

/** "rounded": to the nearest ten tokens above 100 and the nearest token below. */
export const roundTokens = (tokens: number): number =>
  tokens < 100 ? Math.round(tokens) : Math.round(tokens / 10) * 10;

const INVENTORY_LABELS = [
  ['skills', 'Skills'],
  ['agents', 'Agents'],
  ['hooks', 'Hooks'],
  ['mcpServers', 'MCP servers'],
  ['lspServers', 'LSP servers'],
] as const;

function textOf(details: PluginDetails): readonly string[] {
  const head = [
    `Name: ${details.name}`,
    `Version: ${details.version}`,
    ...(details.description === undefined ? [] : [`Description: ${details.description}`]),
    `Source: ${details.source}`,
    '',
    'Component inventory',
    ...INVENTORY_LABELS.map(([key, label]) => {
      const names = details.inventory[key];
      return `  ${label}: ${names.length === 0 ? 'none' : names.join(', ')}`;
    }),
    '',
    'Projected token cost',
    `  Always-on: ~${roundTokens(details.projectedTokens)} tokens per session`,
  ];
  if (details.components.length === 0) return head;
  return [
    ...head,
    '',
    'Per-component (rounded)',
    ...details.components.map(
      (one) =>
        `  ${one.kind} ${one.name}: always-on ~${roundTokens(one.alwaysOn)}, on-invoke ~${roundTokens(one.onInvoke)}`,
    ),
  ];
}

const NOT_FOUND = (name: string): string =>
  `Plugin "${name}" not found. Run \`claude plugin list\` to see installed plugins, or pass --plugin-dir <path> to load one from disk.`;

const BUILTIN_NOT_FOUND = (name: string): string =>
  `Plugin "${name}" not found. Built-in plugins don't appear in \`claude plugin list\`. To see the ones available in a session, run /plugin in Claude Code and open the Installed tab.`;

/** What the command prints: the details of a loaded plugin, or the message for one that is not loaded. */
export function planPluginDetails(requested: string, found: PluginDetails | undefined): Rendered {
  if (found !== undefined) return { stdout: [...textOf(found)], stderr: [], exitCode: 0 };
  const message = requested.endsWith('@builtin')
    ? BUILTIN_NOT_FOUND(requested)
    : NOT_FOUND(requested);
  return { stdout: [], stderr: [message], exitCode: 1 };
}
