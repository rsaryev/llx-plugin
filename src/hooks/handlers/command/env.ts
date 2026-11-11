import type { HandlerEntry, RunContext } from '../context.ts';
import { shellOf } from './shell.ts';
import { subprocessEnvironment } from './subprocess-env.ts';

/**
 * The environment of a command hook (hooks.md, "Common input fields", "Exec form and shell form" and
 * "Persist environment variables"; env-vars.md; plugins/components.md, "Environment, quoting, and
 * matching MCP tools").
 *
 * - "A hook process inherits the parent environment, apart from the `OTEL_*` exporter variables that
 *   Claude Code removes from every subprocess it spawns". The parent environment is the host's with
 *   the settings files' `env` written over it (env-vars.md, "Precedence"), and with its credentials
 *   removed when `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` is `1` (`scrub.ts`).
 * - Both forms "export [the path placeholders] as the environment variables `CLAUDE_PROJECT_DIR`,
 *   `CLAUDE_PLUGIN_ROOT`, and `CLAUDE_PLUGIN_DATA`"; a plugin hook also gets
 *   `CLAUDE_PLUGIN_OPTION_<KEY>` for each option.
 * - What Claude Code sets in every subprocess it spawns: `CLAUDECODE` and `CLAUDE_CODE_CHILD_SESSION`
 *   (`1`), `CLAUDE_CODE_SESSION_ID` (the input's `session_id`) and `CLAUDE_PID` (its own process id).
 * - `CLAUDE_ENV_FILE` on the four events that have one, and only to a hook that runs no PowerShell;
 *   an inherited one never reaches another hook ("Other hook events don't have access to this variable").
 *
 * Judgment (spec/judgments.md): the exported variables replace an inherited one of the same name, and
 * the `OTEL_` prefix and the `CLAUDE_ENV_FILE` name are matched without regard to case on a Windows
 * host, whose environment names are case-insensitive, and exactly elsewhere.
 */

const ENV_FILE = 'CLAUDE_ENV_FILE';

/** The `CLAUDE_ENV_FILE` of this hook: the file of its event, or none. */
async function envFileVariable(
  entry: HandlerEntry<'command'>,
  context: RunContext,
): Promise<Record<string, string>> {
  const envFile = await context.envFiles?.pathFor(
    entry.event,
    shellOf(entry, context),
    context.signal,
  );
  return envFile === undefined ? {} : { [ENV_FILE]: envFile };
}

/**
 * The whole environment the process gets (the port adds nothing and removes nothing); `exported`
 * is what `resolveHookCommand` exports, resolved with the command's own substituter.
 */
export async function processEnvironment(
  entry: HandlerEntry<'command'>,
  exported: Readonly<Record<string, string>>,
  context: RunContext,
): Promise<Readonly<Record<string, string>>> {
  return {
    ...subprocessEnvironment({
      kind: 'hook',
      environment: context.ports.environment.snapshot(),
      ...(context.settingsEnv === undefined ? {} : { settingsEnv: context.settingsEnv }),
      windows: context.windows,
      sessionId: context.sessionId,
      processId: context.processId,
      effort: context.effort,
    }),
    ...exported,
    ...(await envFileVariable(entry, context)),
  };
}
