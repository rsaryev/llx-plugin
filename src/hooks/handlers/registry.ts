import type { HookHandlerType } from '../../protocol/hook-config.ts';
import type { RegisteredHandler } from '../contracts.ts';
import { runCommand } from './command/run-command.ts';
import type { HandlerEntry, HandlerResult, RunContext } from './context.ts';
import { announceStart } from './status.ts';

/**
 * One runner per handler type (hooks.md, "Hook handler fields"): a registry over the official
 * union, so a type the SDK adds is a compile error here, not a missed case.
 */
type Handler<T extends HookHandlerType> = (
  entry: HandlerEntry<T>,
  context: RunContext,
) => Promise<HandlerResult>;

/** A type whose runner is not part of this build: the hook is reported as not run. */
const notRun =
  <T extends HookHandlerType>(type: T): Handler<T> =>
  () =>
    Promise.resolve({
      run: { kind: 'skipped', reason: `${type} hooks are not run by this build.` },
      issues: [],
    });

export const HANDLERS: { readonly [T in HookHandlerType]: Handler<T> } = {
  command: runCommand,
  http: notRun('http'),
  mcp_tool: notRun('mcp_tool'),
  prompt: notRun('prompt'),
  agent: notRun('agent'),
};

/**
 * Runs one handler: tells the host it started (`statusMessage`), then hands it to the runner of
 * its type. `HANDLERS[entry.handler.type]` is the runner for exactly this entry's handler, a
 * correlation TypeScript cannot follow through an index, so the call is asserted once, here.
 */
export function runHandler(entry: RegisteredHandler, context: RunContext): Promise<HandlerResult> {
  announceStart(context.ports.observer, entry);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the runner of the entry's own handler type, see above
  const run = HANDLERS[entry.handler.type] as Handler<HookHandlerType>;
  return run(entry, context);
}
