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

/** What the registry holds: a runner that takes any registered handler. */
type Runner = (entry: RegisteredHandler, context: RunContext) => Promise<HandlerResult>;

const isEntryOf = <T extends HookHandlerType>(
  type: T,
  entry: RegisteredHandler,
): entry is HandlerEntry<T> => entry.handler.type === type;

/**
 * Pairs a runner with the type it reads: the entry is narrowed by the predicate, so no assertion
 * is needed. A handler of another type never reaches it (the registry is keyed by type); if one
 * does, the hook is reported as not run instead of being read as a shape it does not have.
 */
const runnerOf =
  <T extends HookHandlerType>(type: T, run: Handler<T>): Runner =>
  (entry, context) =>
    isEntryOf(type, entry)
      ? run(entry, context)
      : Promise.resolve({
          run: {
            kind: 'skipped',
            reason: `The ${type} runner was given a ${entry.handler.type} hook.`,
          },
          issues: [],
        });

/** A type whose runner is not part of this build: the hook is reported as not run. */
const notRun =
  (type: HookHandlerType): Runner =>
  () =>
    Promise.resolve({
      run: { kind: 'skipped', reason: `${type} hooks are not run by this build.` },
      issues: [],
    });

export const HANDLERS: { readonly [T in HookHandlerType]: Runner } = {
  command: runnerOf('command', runCommand),
  http: notRun('http'),
  mcp_tool: notRun('mcp_tool'),
  prompt: notRun('prompt'),
  agent: notRun('agent'),
};

/** Runs one handler: tells the host it started (`statusMessage`), then hands it to the runner of its type. */
export function runHandler(entry: RegisteredHandler, context: RunContext): Promise<HandlerResult> {
  announceStart(context.ports.observer, entry);
  return HANDLERS[entry.handler.type](entry, context);
}
