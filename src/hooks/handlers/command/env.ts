import { exportedEnvironment, pluginVariableValue } from '../../../loading/resolve/index.ts';
import { applySettingsEnv } from '../../../settings/env.ts';
import type { HandlerEntry, RunContext } from '../context.ts';
import { substitutionScope } from './placeholders.ts';
import { scrubEnvironment, scrubRequested } from './scrub.ts';
import { shellOf } from './shell.ts';

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

const OTEL = /^OTEL_/;
const OTEL_ANY_CASE = /^OTEL_/i;
const ENV_FILE = 'CLAUDE_ENV_FILE';

/** The variables a plugin's hooks receive; a handler of no plugin has only the project folder. */
async function exported(
  entry: HandlerEntry<'command'>,
  context: RunContext,
): Promise<Record<string, string>> {
  const scope = substitutionScope(entry, context);
  return entry.pluginId === undefined
    ? { CLAUDE_PROJECT_DIR: await pluginVariableValue('CLAUDE_PROJECT_DIR', scope) }
    : exportedEnvironment('hook-command', scope);
}

/** What the host process is to every hook it starts. */
async function hostVariables(
  entry: HandlerEntry<'command'>,
  context: RunContext,
): Promise<Record<string, string>> {
  const envFile = await context.envFiles?.pathFor(
    entry.event,
    shellOf(entry, context),
    context.signal,
  );
  return {
    CLAUDECODE: '1',
    CLAUDE_CODE_CHILD_SESSION: '1',
    ...(context.sessionId === undefined ? {} : { CLAUDE_CODE_SESSION_ID: context.sessionId }),
    ...(context.processId === undefined ? {} : { CLAUDE_PID: String(context.processId) }),
    ...(envFile === undefined ? {} : { [ENV_FILE]: envFile }),
  };
}

/** The environment a hook inherits: the host's, the settings' written over it, then the scrub, then the `OTEL_*` removal. */
function inheritedEnvironment(context: RunContext): [string, string][] {
  const parent = applySettingsEnv(
    context.ports.environment.snapshot(),
    context.settingsEnv ?? {},
    context.windows,
  );
  const scrubbed = scrubRequested(parent) ? scrubEnvironment(parent, context.windows) : parent;
  const exporter = context.windows ? OTEL_ANY_CASE : OTEL;
  const isEnvFile = (name: string): boolean =>
    (context.windows ? name.toUpperCase() : name) === ENV_FILE;
  return Object.entries(scrubbed).filter(([name]) => !exporter.test(name) && !isEnvFile(name));
}

/** The whole environment the process gets (the port adds nothing and removes nothing). */
export async function processEnvironment(
  entry: HandlerEntry<'command'>,
  context: RunContext,
): Promise<Readonly<Record<string, string>>> {
  return {
    ...Object.fromEntries(inheritedEnvironment(context)),
    ...(await exported(entry, context)),
    ...(await hostVariables(entry, context)),
  };
}
