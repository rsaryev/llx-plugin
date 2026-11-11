/**
 * The recipe of debug-your-config.md, "Test against a clean configuration": an empty directory, a
 * fresh `CLAUDE_CONFIG_DIR`, and `--setting-sources user`, so that the session has none of your own
 * configuration; then what each outcome of reproducing the problem points to. Pure: it only builds
 * the launch and the advice, the host or the person runs them.
 */

export interface CleanLaunch {
  /** The empty directory to run in. */
  readonly directory: string;
  /** The fresh configuration directory. */
  readonly configDir: string;
  /** The variable that "applies to this one launch" (or, in PowerShell, to the rest of the shell session). */
  readonly env: { readonly CLAUDE_CONFIG_DIR: string };
  /** `--setting-sources user` turns off project configuration (`.claude/settings.json`, `CLAUDE.md`, `.mcp.json`). */
  readonly args: readonly ['--setting-sources', 'user'];
}

/** The launch for a home directory: `~/claude-clean/empty` and `~/claude-clean/config`. */
export function cleanLaunch(home: string): CleanLaunch {
  const root = `${home.replace(/[\\/]+$/, '')}/claude-clean`;
  return {
    directory: `${root}/empty`,
    configDir: `${root}/config`,
    env: { CLAUDE_CONFIG_DIR: `${root}/config` },
    args: ['--setting-sources', 'user'],
  };
}

/** The documented commands, per shell. */
export type CleanShell = 'posix' | 'powershell';

export function cleanLaunchCommands(shell: CleanShell): {
  readonly create: string;
  readonly launch: string;
} {
  return shell === 'posix'
    ? {
        create: 'mkdir -p ~/claude-clean/empty && cd ~/claude-clean/empty',
        launch: 'CLAUDE_CONFIG_DIR=~/claude-clean/config claude --setting-sources user',
      }
    : {
        create:
          'New-Item -ItemType Directory -Force "$HOME/claude-clean/empty" | Out-Null\nSet-Location "$HOME/claude-clean/empty"',
        launch:
          '$env:CLAUDE_CONFIG_DIR = "$HOME/claude-clean/config"\nclaude --setting-sources user',
      };
}

/** What reproducing the problem in the clean session means. */
export type CleanOutcome = 'problem-gone' | 'problem-persists';

/**
 * "Problem gone": the cause is in your user or project configuration, so copy `~/.claude.json` and the
 * files in `~/.claude` into the clean directory one at a time, then try the project without
 * `--setting-sources user`. "Problem persists": the cause is outside it; check `/status` for managed
 * settings and the shell for environment variables.
 */
export function afterCleanRun(outcome: CleanOutcome): {
  readonly cause: 'user-or-project-configuration' | 'outside-user-and-project-configuration';
  readonly next: readonly string[];
} {
  return outcome === 'problem-gone'
    ? {
        cause: 'user-or-project-configuration',
        next: [
          'Copy ~/.claude.json and the files in ~/.claude into the clean configuration directory one at a time',
          'If none brings the problem back, start Claude Code in your project directory without --setting-sources user, with CLAUDE_CONFIG_DIR still pointing at the clean directory',
        ],
      }
    : {
        cause: 'outside-user-and-project-configuration',
        next: [
          'Run /status in the session to check for managed settings',
          'Check your shell for environment variables',
        ],
      };
}
