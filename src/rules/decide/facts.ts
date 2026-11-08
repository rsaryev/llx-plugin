import { POWERSHELL_DIALECT } from '../bash/dialect.ts';
import { commandOf } from '../bash/shell.ts';
import { scanCommand } from '../bash/split.ts';
import { readsNetworkPath } from '../path/network.ts';
import type { DecisionReason, PathContext, PreparedCall } from '../types.ts';
import type { DecideContext } from './context.ts';
import { removesCriticalPath } from './critical-removal.ts';
import { isProtectedPath } from './protected-paths.ts';
import { inScope, toolPath } from './scope.ts';
import { shellVerdict, UNREAD, type ShellVerdict } from './shell-commands.ts';

/**
 * What a call is, read once from its tool, input and the session, so the modes ask questions
 * instead of re-reading the call. Every field is data about the call; none is a decision.
 */
export interface CallFacts {
  /** Runs without a prompt in every mode that prompts: reads in scope, read-only commands, tools needing no permission. */
  readonly readOnly: boolean;
  /** Why it is read-only. */
  readonly readReason: DecisionReason;
  /** A call of a file-reading tool (Read, Grep, Glob). */
  readonly readsFiles: boolean;
  /** A file-reading call whose path is a network path. */
  readonly network: boolean;
  /** An edit tool whose path, and whose resolved paths, are in scope and not protected. */
  readonly editsInScope: boolean;
  /** A Bash command made of read-only and filesystem commands in scope. */
  readonly shellEdits: boolean;
  /** An edit that is in scope as asked and resolves outside it through a symlink. */
  readonly escapesViaLink: boolean;
  /** A write to a protected path. */
  readonly protectedWrite: boolean;
  /** Protected only where a symlink leads, not as asked. */
  readonly protectedViaLink: boolean;
  /** A Bash or PowerShell call. */
  readonly shell: boolean;
  /** A recognized critical-path removal. */
  readonly criticalRemoval: boolean;
  /** The tool requires user interaction. */
  readonly interaction: boolean;
  /** A file tool call the `permissions.block*OutsideWorkingDirectories` keys refuse. */
  readonly blocked: boolean;
  /** The command, split, for a shell call. */
  readonly parts: ShellVerdict;
  /** A tool no rule, hook or mode stops (`EndConversation`). */
  readonly exempt: boolean;
}

const NONE: CallFacts = {
  readOnly: false,
  readReason: 'read-in-working-directory',
  readsFiles: false,
  network: false,
  editsInScope: false,
  shellEdits: false,
  escapesViaLink: false,
  protectedWrite: false,
  protectedViaLink: false,
  shell: false,
  criticalRemoval: false,
  interaction: false,
  blocked: false,
  parts: UNREAD,
  exempt: false,
};

type Builder = (call: PreparedCall, ctx: DecideContext) => Partial<CallFacts>;

/** Where a call acts: the path it asked for and where the host's symlink check says it leads. */
const touched = (call: PreparedCall, requested: string): readonly string[] => [
  requested,
  ...(call.resolvedPaths ?? []),
];

const allInScope = (paths: readonly string[], context: PathContext): boolean =>
  paths.every((path) => inScope(path, context));

/** Read, Grep and Glob: "File reads, Grep ... No, within the working directory and additional directories". */
const readFacts: Builder = (call, ctx) => {
  const requested = toolPath(call, ctx.match.paths);
  if (requested === undefined) return { readsFiles: true };
  const inside = allInScope(touched(call, requested), ctx.match.paths);
  const network = readsNetworkPath(call, ctx.match.paths);
  return {
    readsFiles: true,
    network,
    readOnly: inside && !network,
    blocked: !inside && ctx.blockReadsOutsideWorkingDirectories === true,
  };
};

/** Edit, Write, NotebookEdit and MultiEdit. */
const editFacts: Builder = (call, ctx) => {
  const requested = toolPath(call, ctx.match.paths);
  if (requested === undefined) return {};
  const { paths } = ctx.match;
  const options = ctx.protectedPaths ?? {};
  const all = touched(call, requested);
  const asked = isProtectedPath(requested, paths, options);
  const viaLink = !asked && all.some((path) => isProtectedPath(path, paths, options));
  const inside = allInScope(all, paths);
  return {
    editsInScope: inside && !asked && !viaLink,
    escapesViaLink: inScope(requested, paths) && !inside,
    protectedWrite: asked || viaLink,
    protectedViaLink: viaLink,
    blocked: !inside && ctx.blockWritesOutsideWorkingDirectories === true,
  };
};

const bashFacts: Builder = (call, ctx) => {
  const command = commandOf(call.input);
  if (command === undefined) return { shell: true };
  const parts = shellVerdict(command, ctx.match.paths, ctx.protectedPaths);
  return {
    shell: true,
    parts,
    readOnly: parts.readOnly,
    readReason: 'read-only-command',
    shellEdits: parts.editsInScope,
    protectedWrite: parts.writesProtected,
    criticalRemoval: removesCriticalPath(command, ctx.match.paths),
  };
};

/** PowerShell: split into subcommands for the rules; its read-only set and `acceptEdits` cmdlets are not modelled. */
const powershellFacts: Builder = (call) => {
  const command = commandOf(call.input);
  if (command === undefined) return { shell: true };
  const { subcommands, parseable } = scanCommand(command, POWERSHELL_DIALECT);
  const parts: ShellVerdict = {
    ...UNREAD,
    subcommands: parseable ? subcommands : [],
    readOnlyParts: subcommands.map(() => false),
  };
  return { shell: true, parts };
};

const BUILDERS: ReadonlyMap<string, Builder> = new Map<string, Builder>([
  ['Read', readFacts],
  ['Grep', readFacts],
  ['Glob', readFacts],
  ['Edit', editFacts],
  ['Write', editFacts],
  ['NotebookEdit', editFacts],
  ['MultiEdit', editFacts],
  ['Bash', bashFacts],
  ['PowerShell', powershellFacts],
]);

/** "The built-in `AskUserQuestion` tool and MCP tools marked `requiresUserInteraction`." */
const INTERACTION_TOOLS: ReadonlySet<string> = new Set(['AskUserQuestion']);

/**
 * tools-reference.md, "EndConversation tool behavior": "The tool never prompts for permission, and
 * PreToolUse hooks don't run for it. While any other tool remains, you can't block it either: deny
 * and ask rules naming `EndConversation` have no effect". Whether another tool remains is the tool
 * list's business (`availableTools`), so `decide` always lets it run (spec/judgments.md).
 */
const EXEMPT_TOOLS: ReadonlySet<string> = new Set(['EndConversation']);

/** What `call` is, in the session `ctx` describes. */
export function factsOf(call: PreparedCall, ctx: DecideContext): CallFacts {
  const built = { ...NONE, ...BUILDERS.get(call.toolName)?.(call, ctx) };
  const noPermission = ctx.requiresPermission?.(call.toolName) === false;
  return {
    ...built,
    readOnly: built.readOnly || noPermission,
    readReason: noPermission && !built.readOnly ? 'no-permission-required' : built.readReason,
    exempt: EXEMPT_TOOLS.has(call.toolName),
    interaction:
      INTERACTION_TOOLS.has(call.toolName) ||
      ctx.requiresUserInteraction?.has(call.toolName) === true,
  };
}
