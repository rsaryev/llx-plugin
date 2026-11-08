/**
 * The checks of "Test and debug" (plugins/create.md): "When a change to your plugin doesn't show up,
 * work through these checks in order. Each one tells you what Claude Code did with the plugin." The
 * list only; running the commands is the cli stream's and the host's.
 */

/** Where the command is typed: "In your shell" or "in the running session". */
export type DebugPlace = 'shell' | 'session';

export interface DebugStep {
  readonly place: DebugPlace;
  readonly command: string;
  /** What the step tells about the plugin. */
  readonly tells: string;
}

export interface DebugFacts {
  /** The plugin sits in a skills directory (`~/.claude/skills/` or a project's `.claude/skills/`). */
  readonly inSkillsDirectory: boolean;
  /** The plugin's folder, for a plugin that is not installed: `claude plugin list` takes it as `--plugin-dir`. */
  readonly pluginDir?: string | undefined;
}

const validate = (): DebugStep => ({
  place: 'shell',
  command: 'claude plugin validate <path>',
  tells:
    'whether the manifest and the frontmatter of every skill, agent and command file are valid',
});

const reload: DebugStep = {
  place: 'session',
  command: '/reload-plugins',
  tells: 'applies the edits made on disk and prints one `Reloaded:` line with counts',
};

const manager: DebugStep = {
  place: 'session',
  command: '/plugin',
  tells:
    'the Installed tab lists the plugin and the components found; the Errors tab lists what failed to load and why',
};

/** `claude plugin list` shows session-only plugins "only when the same flag precedes the subcommand". */
const list = (pluginDir: string | undefined): DebugStep => ({
  place: 'shell',
  command:
    pluginDir === undefined ? 'claude plugin list' : `claude --plugin-dir ${pluginDir} plugin list`,
  tells:
    'prints session-only and skills-directory plugins in their own sections with `Status: ✔ loaded` or the load error',
});

const blocked: DebugStep = {
  place: 'session',
  command: '/status',
  tells:
    'a skills-directory plugin that `claude plugin list` does not print, with no error there or in `/plugin`, may be blocked by managed settings',
};

/** The ordered checks; the last applies only to a plugin in a skills directory. */
export function pluginDebugSteps(facts: DebugFacts): readonly DebugStep[] {
  return [
    validate(),
    reload,
    manager,
    list(facts.pluginDir),
    ...(facts.inSkillsDirectory ? [blocked] : []),
  ];
}

/** The checks of the other components: `/mcp` for a server, the debug log for a hook. */
export const COMPONENT_CHECKS = {
  mcpServer: {
    place: 'session',
    command: '/mcp',
    tells: 'lists a healthy server as connected',
  },
  hook: {
    place: 'session',
    command: 'trigger the event the hook matches, then read the debug log',
    tells: 'which hooks matched, their exit codes and their output',
  },
} as const satisfies Readonly<Record<string, DebugStep>>;
