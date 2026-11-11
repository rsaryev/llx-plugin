import { preToolUseHookOutcome, type HookOutcome } from '../hooks/index.ts';
import type { PortFailure } from '../ports/failure.ts';
import {
  decide,
  prepareCall,
  resolveRuleDirectories,
  type ToolNames,
  type DecideContext,
  type Decision,
  type PathResolver,
  type PreparedCall,
} from '../rules/index.ts';
import type { HookPart } from './session-hooks.ts';

/** What `checkTool` found for one tool call. */
export interface ToolCheck {
  /** What the PreToolUse hooks answered: their messages, context and effects. */
  readonly hook: HookOutcome<'PreToolUse'>;
  /** The input to run: the hook's `updatedInput`, unless the hook deferred or returned none. */
  readonly input: unknown;
  /** The permission decision over that input, with the hook's answer applied. */
  readonly decision: Decision;
  /**
   * Why the path of that input could not be resolved (symlinks that form a loop): "the Read, Edit,
   * and Write tools refuse the operation" (permissions.md, "Paths that can't be resolved or that
   * change"), so `decision` is a deny for `unresolvable-path`. Only with a `resolver`.
   */
  readonly refused?: PortFailure;
}

type PermissionContext = Omit<DecideContext, 'hook'>;

export interface ToolCheckPart {
  /**
   * Whether a tool call may run: the PreToolUse hooks, then the permission decision over the input
   * they return (hooks.md, "PreToolUse decision control": "Claude Code evaluates permission rules ...
   * against the input your hook returns, not the input Claude sent"; for `"defer"` it is ignored).
   * With `resolver`, the symlink check (permissions.md, "Symlinks") runs here over that input:
   * `prepareCall` (the call's own `resolvedPaths` are dropped, they named the input Claude sent), and
   * `resolveRuleDirectories` when `permissionContext.match.paths` has no `realDirectories`. Without
   * it, `call` is taken as the host prepared it.
   * With `SessionOptions.toolNames`, `call.toolName` is the host's name: the hooks and the rules read
   * the Claude Code name, `call.input` is taken as Claude Code's input for that tool.
   * The prompt, a deferred turn and the auto-mode review of a changed input stay the host's.
   */
  checkTool(
    call: PreparedCall,
    options: {
      readonly toolUseId: string;
      readonly permissionContext: PermissionContext;
      readonly signal: AbortSignal;
      readonly resolver?: PathResolver;
    },
  ): Promise<ToolCheck>;
}

interface Resolving {
  readonly resolver: PathResolver;
  readonly signal: AbortSignal;
}

/** The context with the real locations of the rules' and the working directories, unless the host gave them. */
async function withRealDirectories(
  context: PermissionContext,
  { resolver, signal }: Resolving,
): Promise<PermissionContext> {
  const { paths } = context.match;
  if (paths.realDirectories !== undefined) return context;
  const realDirectories = await resolveRuleDirectories(context.rules, paths, resolver, { signal });
  return { ...context, match: { ...context.match, paths: { ...paths, realDirectories } } };
}

/** The call that runs and the context it is decided in, with the symlink check done when a resolver is given. */
async function preparedRun(
  call: PreparedCall,
  input: unknown,
  context: PermissionContext,
  resolving: Resolving | undefined,
): Promise<{ readonly run: PreparedCall | PortFailure; readonly context: PermissionContext }> {
  if (resolving === undefined) return { run: { ...call, input }, context };
  const { resolvedPaths: _stale, ...rest } = call;
  const run = await prepareCall({ ...rest, input }, context.match.paths, resolving.resolver, {
    signal: resolving.signal,
  });
  return { run, context: await withRealDirectories(context, resolving) };
}

/** `names` reads the call's tool name in Claude Code's terms (`SessionOptions.toolNames`). */
export function createToolCheckPart(
  hooks: Pick<HookPart, 'dispatch'>,
  names: () => ToolNames,
): ToolCheckPart {
  return {
    async checkTool(given, { toolUseId, permissionContext, signal, resolver }) {
      // The dispatch reads the host's name itself; the rules decide the Claude Code name.
      const facts = { tool_name: given.toolName, tool_input: given.input, tool_use_id: toolUseId };
      const hook = await hooks.dispatch('PreToolUse', facts, { signal });
      // The merge already drops `updatedInput` after a deny or a defer (hooks/output).
      const input = hook.effects.updatedInput ?? given.input;
      // The rules decide the Claude Code name of the call that runs, read from the input it runs with.
      const call = { ...given, toolName: names().claudeName(given.toolName, input) };
      const resolving = resolver === undefined ? undefined : { resolver, signal };
      const { run, context } = await preparedRun(call, input, permissionContext, resolving);
      if ('failure' in run) {
        const decision: Decision = { outcome: 'deny', reason: 'unresolvable-path' };
        return { hook, input, decision, refused: run };
      }
      const decision = decide(run, { ...context, hook: preToolUseHookOutcome(hook) });
      return { hook, input, decision };
    },
  };
}
