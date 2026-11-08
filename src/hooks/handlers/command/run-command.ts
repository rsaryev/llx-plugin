import type { PluginIssue } from '../../../format/issues.ts';
import type { CommandRun, CommandSpec } from '../../../ports/index.ts';
import type { CommandRawRun, HandlerEntry, HandlerResult, RunContext } from '../context.ts';
import { isPluginSource } from '../../source-kind.ts';
import { handlerTimeoutMs } from '../timeouts.ts';
import { MODES, modeOf, settle, startInBackground } from './async.ts';
import { workingDirectory } from './cwd-fallback.ts';
import { processEnvironment } from './env.ts';
import { planExecForm, type CommandPlan } from './exec-form.ts';
import { planShellForm } from './shell-form.ts';

/**
 * A `command` hook (hooks.md, "Command hook fields"): the form it runs in, the process it gets,
 * and the run the port reports. What the exit code means is the interpreter's.
 */

type Form = CommandSpec['form'];

const FORMS: {
  readonly [F in Form]: (
    entry: HandlerEntry<'command'>,
    args: readonly string[],
    context: RunContext,
  ) => Promise<CommandPlan>;
} = {
  exec: planExecForm,
  shell: (entry, _args, context) => planShellForm(entry, context),
};

/** "A command hook runs as exec form when `args` is set, and shell form when `args` is omitted." */
const formOf = (entry: HandlerEntry<'command'>): Form =>
  entry.handler.args === undefined ? 'shell' : 'exec';

/** A plan with no spec ran nothing: the first error says why. */
const skipped = (issues: readonly PluginIssue[]): CommandRawRun => ({
  kind: 'skipped',
  reason: issues.find(({ severity }) => severity === 'error')?.message ?? 'The hook did not run.',
});

async function request(
  entry: HandlerEntry<'command'>,
  spec: CommandSpec,
  context: RunContext,
): Promise<{ readonly run: CommandRun; readonly issues: readonly PluginIssue[] }> {
  const directory = await workingDirectory(context);
  const timeoutMs = handlerTimeoutMs(entry, context.timeouts);
  return {
    issues: directory.issues,
    run: {
      spec,
      cwd: directory.cwd,
      env: await processEnvironment(entry, context),
      stdin: context.input,
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
      signal: context.signal,
    },
  };
}

/**
 * "A plugin's hook fails with `Failed to run: Plugin directory does not exist: <path> (<plugin> — run
 * /plugin to reinstall)`, and the hook doesn't run, when the directory your session loaded the
 * plugin's hooks from is gone from disk" (plugins/troubleshooting.md). Judgment (spec/judgments.md):
 * the check costs a directory lookup per plugin hook run, so the host turns it on
 * (`checkPluginDirectory`); the docs' "shown once per session for each hook event and command" is
 * the host's to do, since it holds the session.
 */
async function missingPluginDirectory(
  entry: HandlerEntry<'command'>,
  context: RunContext,
): Promise<string | undefined> {
  const { pluginId, source } = entry;
  if (context.checkPluginDirectory !== true || !isPluginSource(source)) return undefined;
  if (pluginId === undefined) return undefined;
  const { locations } = context.ports;
  const root = locations.pluginRoot(pluginId);
  const found = await locations.existingDirectory([root], context.signal);
  return found === undefined
    ? `Failed to run: Plugin directory does not exist: ${root} (${source.pluginName ?? pluginId} — run /plugin to reinstall)`
    : undefined;
}

export async function runCommand(
  entry: HandlerEntry<'command'>,
  context: RunContext,
): Promise<HandlerResult> {
  const missing = await missingPluginDirectory(entry, context);
  if (missing !== undefined) return { run: { kind: 'not-started', message: missing }, issues: [] };
  const plan = await FORMS[formOf(entry)](entry, entry.handler.args ?? [], context);
  if (plan.notStarted !== undefined) {
    return { run: { kind: 'not-started', message: plan.notStarted }, issues: plan.issues };
  }
  if (plan.spec === undefined) return { run: skipped(plan.issues), issues: plan.issues };
  const prepared = await request(entry, plan.spec, context);
  const issues = [...plan.issues, ...prepared.issues];
  const { runner } = context.ports;
  const mode = MODES[modeOf(entry.handler)];
  const run = mode.background
    ? startInBackground(runner, prepared.run, mode)
    : await settle(runner, prepared.run);
  return { run, issues };
}
