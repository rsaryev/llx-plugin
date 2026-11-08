import { commandOf } from '../bash/shell.ts';
import { readsNetworkPath } from '../path/network.ts';
import type { DecisionReason, PathContext, PreparedCall } from '../types.ts';
import { blockPaths, readBlocked, writeBlockReason } from './block-exceptions.ts';
import type { DecideContext } from './context.ts';
import { cannotRuleOutRemoval, removesCriticalPath } from './critical-removal.ts';
import { powershellVerdict } from './powershell-edits.ts';
import { isProtectedPath, isSymlinkTargetOnly } from './protected-paths.ts';
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
  /** A connector tool the organization set to `ask`. */
  readonly connectorAsk: boolean;
  /** Why a file tool call is refused by the `permissions.block*OutsideWorkingDirectories` keys, if it is. */
  readonly blockedBy: DecisionReason | undefined;
  /**
   * A Bash command that prompts under `permissions.blockReadsOutsideWorkingDirectories`: it reads
   * outside the working directories, or the parser cannot trace it.
   */
  readonly readBlockPrompt: boolean;
  /** The command, split, for a shell call. */
  readonly parts: ShellVerdict;
  /** A tool no rule, hook or mode stops (`EndConversation`). */
  readonly exempt: boolean;
  /** A Bash command that asks to run outside the sandbox (`dangerouslyDisableSandbox: true`). */
  readonly unsandboxed: boolean;
  /** A `SubagentHandback` call, the delivery of a subagent's report. */
  readonly handback: boolean;
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
  connectorAsk: false,
  blockedBy: undefined,
  readBlockPrompt: false,
  parts: UNREAD,
  exempt: false,
  unsandboxed: false,
  handback: false,
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
    blockedBy: readBlocked(touched(call, requested), ctx) ? 'outside-working-directory' : undefined,
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
  const viaLink =
    !asked &&
    all.some(
      (path) => isProtectedPath(path, paths, options) || isSymlinkTargetOnly(path, paths, options),
    );
  const inside = allInScope(all, paths);
  return {
    editsInScope: inside && !asked && !viaLink,
    escapesViaLink: inScope(requested, paths) && !inside,
    protectedWrite: asked || viaLink,
    protectedViaLink: viaLink,
    blockedBy: writeBlockReason(all, ctx),
  };
};

/** Whether a Bash command prompts under the read block: it reads outside, or cannot be traced. */
const promptsUnderReadBlock = (
  command: string,
  parts: ShellVerdict,
  call: PreparedCall,
  ctx: DecideContext,
): boolean => {
  if (ctx.blockReadsOutsideWorkingDirectories !== true || ctx.sandboxEnforcesReadBlock === true) {
    return false;
  }
  // A directory only repository settings add is outside the working directories for the block.
  const counted =
    ctx.repositoryDirectories === undefined
      ? parts
      : shellVerdict(command, blockPaths(ctx), ctx.protectedPaths, call.resolvedPaths);
  return counted.readsOutside || counted.untraceable;
};

/** "Commands that ask to run outside the sandbox": the unsandboxed retry's `dangerouslyDisableSandbox` parameter. */
const asksOutsideSandbox = (input: unknown): boolean =>
  typeof input === 'object' &&
  input !== null &&
  'dangerouslyDisableSandbox' in input &&
  input.dangerouslyDisableSandbox === true;

const bashFacts: Builder = (call, ctx) => {
  const command = commandOf(call.input);
  if (command === undefined) return { shell: true };
  const parts = shellVerdict(command, ctx.match.paths, ctx.protectedPaths, call.resolvedPaths);
  return {
    shell: true,
    unsandboxed: asksOutsideSandbox(call.input),
    parts,
    readOnly: parts.readOnly,
    readReason: 'read-only-command',
    shellEdits: parts.editsInScope,
    protectedWrite: parts.writesProtected,
    protectedViaLink: parts.writesProtectedViaLink,
    readBlockPrompt: promptsUnderReadBlock(command, parts, call, ctx),
    criticalRemoval: removesCriticalPath(command, ctx.match.paths) || cannotRuleOutRemoval(command),
  };
};

/** PowerShell: split into subcommands for the rules, and the `acceptEdits` cmdlets read; no read-only set. */
const powershellFacts: Builder = (call, ctx) => {
  const command = commandOf(call.input);
  if (command === undefined) return { shell: true };
  const parts = powershellVerdict(
    command,
    ctx.match.paths,
    ctx.protectedPaths ?? {},
    call.resolvedPaths ?? [],
  );
  return {
    shell: true,
    parts,
    shellEdits: parts.editsInScope,
    protectedWrite: parts.writesProtected,
    protectedViaLink: parts.writesProtectedViaLink,
  };
};

/** WebFetch: a URL whose domain is in the host's preapproved set fetches without a prompt. */
const webFetchFacts: Builder = (call, ctx) => {
  const url =
    typeof call.input === 'object' && call.input !== null && 'url' in call.input
      ? call.input.url
      : undefined;
  const hostname = typeof url === 'string' ? hostnameOf(url) : undefined;
  const preapproved = hostname !== undefined && ctx.preapprovedFetchDomain?.(hostname) === true;
  return { readOnly: preapproved, readReason: 'preapproved-domain' };
};

const hostnameOf = (text: string): string | undefined => {
  try {
    return new URL(text).hostname.toLowerCase();
  } catch {
    return undefined;
  }
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
  ['WebFetch', webFetchFacts],
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

const HANDBACK_TOOL = 'SubagentHandback';

/** What `call` is, in the session `ctx` describes. */
export function factsOf(call: PreparedCall, ctx: DecideContext): CallFacts {
  const built = { ...NONE, ...BUILDERS.get(call.toolName)?.(call, ctx) };
  // tools-reference.md: file-access tools marked No "still prompt for paths outside the working
  // directory", so the column never overrides what the path facts of a file read decided.
  const noPermission = ctx.requiresPermission?.(call.toolName) === false && !built.readsFiles;
  return {
    ...built,
    readOnly: built.readOnly || noPermission,
    readReason: noPermission && !built.readOnly ? 'no-permission-required' : built.readReason,
    exempt: EXEMPT_TOOLS.has(call.toolName),
    handback: call.toolName === HANDBACK_TOOL,
    interaction:
      INTERACTION_TOOLS.has(call.toolName) ||
      ctx.requiresUserInteraction?.has(call.toolName) === true,
    connectorAsk: ctx.connectorToolsSetToAsk?.has(call.toolName) === true,
  };
}
