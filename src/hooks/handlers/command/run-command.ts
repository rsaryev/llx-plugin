import type { PluginIssue } from '../../../format/issues.ts';
import type { CommandRun, CommandSpec } from '../../../ports/index.ts';
import type { CommandRawRun, HandlerEntry, HandlerResult, RunContext } from '../context.ts';
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

export async function runCommand(
  entry: HandlerEntry<'command'>,
  context: RunContext,
): Promise<HandlerResult> {
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
