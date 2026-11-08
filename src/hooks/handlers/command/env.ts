import { exportedEnvironment, pluginVariableValue } from '../../../loading/resolve/index.ts';
import type { HandlerEntry, RunContext } from '../context.ts';
import { substitutionScope } from './placeholders.ts';

/**
 * The environment of a command hook (hooks.md, "Common input fields" and "Exec form and shell
 * form"): "A hook process inherits the parent environment, apart from the `OTEL_*` exporter
 * variables that Claude Code removes from every subprocess it spawns", and both forms "export
 * [the path placeholders] as the environment variables `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT`,
 * and `CLAUDE_PLUGIN_DATA`"; a plugin hook also gets `CLAUDE_PLUGIN_OPTION_<KEY>` for each option
 * (plugins/manifest-reference.md, "Reference a saved value").
 *
 * Not done here: `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` and the HIPAA credential removal name no
 * variable list in the docs, so they are the host's (it implements `Environment`).
 */

const OTEL = /^OTEL_/;

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

/** The whole environment the process gets (the port adds nothing and removes nothing). */
export async function processEnvironment(
  entry: HandlerEntry<'command'>,
  context: RunContext,
): Promise<Readonly<Record<string, string>>> {
  const inherited = Object.entries(context.ports.environment.snapshot()).filter(
    ([name]) => !OTEL.test(name),
  );
  return { ...Object.fromEntries(inherited), ...(await exported(entry, context)) };
}
