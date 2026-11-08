import { warning, type PluginIssue } from '../../format/issues.ts';
import { boolIn, specificOf, stringIn, stringsIn, textIn } from './fields.ts';
import { checkToolOutput, isMcpToolName } from './tool-output.ts';
import { NOTHING, factOf, lastOf, type Merged, type Merger, type Read } from './merge-rules.ts';
import type { HookSpecificOutputOf } from '../../protocol/hook-events.ts';

/**
 * The merges of the events whose output only adds fields: the session and prompt events, the
 * watch lists, the display text, `retry`, the worktree path and compaction instructions
 * (hooks.md, each event's "decision control" or "output" section).
 */

const anyTrue = (reads: readonly Read[], key: string): true | undefined =>
  reads.some((read) => boolIn(read.specific, key) === true) ? true : undefined;

const lastText = (reads: readonly Read[], key: string): string | undefined =>
  lastOf(reads.map((read) => textIn(read.specific, key)));

/** Every hook's list, once each, in order: judgment (spec/judgments.md). `undefined` when no hook returned one. */
function unionOfLists(reads: readonly Read[]): readonly string[] | undefined {
  const lists = reads.flatMap((read) => stringsIn(read.specific, 'watchPaths') ?? []);
  const returned = reads.some((read) => stringsIn(read.specific, 'watchPaths') !== undefined);
  return returned ? [...new Set(lists)] : undefined;
}

/** "Applies when `source` is `"startup"`, `"resume"`, or `"fork"`." */
const TITLE_SOURCES: readonly unknown[] = ['startup', 'resume', 'fork'];

export const mergeSessionStart: Merger = (reads, facts) => {
  const initialUserMessage = lastText(reads, 'initialUserMessage');
  const sessionTitle = TITLE_SOURCES.includes(factOf(facts, 'source'))
    ? lastText(reads, 'sessionTitle')
    : undefined;
  const reloadSkills = anyTrue(reads, 'reloadSkills');
  const watchPaths = unionOfLists(reads);
  return {
    effects: {
      ...(initialUserMessage === undefined ? {} : { initialUserMessage }),
      ...(sessionTitle === undefined ? {} : { sessionTitle }),
      ...(reloadSkills === undefined ? {} : { reloadSkills }),
      ...(watchPaths === undefined ? {} : { watchPaths }),
    },
    issues: [],
  };
};

export const mergeUserPrompt: Merger = (reads) => {
  const sessionTitle = lastText(reads, 'sessionTitle');
  const suppressOriginalPrompt = anyTrue(reads, 'suppressOriginalPrompt');
  return {
    effects: {
      ...(sessionTitle === undefined ? {} : { sessionTitle }),
      ...(suppressOriginalPrompt === undefined ? {} : { suppressOriginalPrompt }),
    },
    issues: [],
  };
};

export const mergeWatchList: Merger = (reads) => {
  const watchPaths = unionOfLists(reads);
  return watchPaths === undefined ? NOTHING : { effects: { watchPaths }, issues: [] };
};

export const mergeDisplay: Merger = (reads) => {
  const displayContent = lastOf(reads.map((read) => stringIn(read.specific, 'displayContent')));
  return displayContent === undefined ? NOTHING : { effects: { displayContent }, issues: [] };
};

/**
 * "Claude Code ignores `retry: true` when the classifier produced no verdict on the action": the
 * denial `reason` then "starts with `Auto mode could not evaluate this action and is blocking it
 * for safety`", and "Claude Code already tells the model in the rejection message whether to retry
 * later or move on".
 */
const NO_VERDICT_REASON = 'Auto mode could not evaluate this action and is blocking it for safety';

export const mergeRetry: Merger = (reads, facts) => {
  const retry = anyTrue(reads, 'retry');
  if (retry === undefined) return NOTHING;
  const reason = factOf(facts, 'reason');
  if (typeof reason === 'string' && reason.startsWith(NO_VERDICT_REASON)) {
    return {
      effects: {},
      issues: [
        warning(
          'hooks.PermissionDenied.retry',
          'is ignored: the classifier produced no verdict on the action',
        ),
      ],
    };
  }
  return { effects: { retry }, issues: [] };
};

export const mergeWorktreeCreate: Merger = (reads) => {
  const worktreePath = lastOf(reads.map((read) => stringIn(read.specific, 'worktreePath')));
  return worktreePath === undefined ? NOTHING : { effects: { worktreePath }, issues: [] };
};

/** "When a PreCompact hook exits 0 and doesn't block, Claude Code uses its stdout as instructions." */
export const mergePreCompact: Merger = (reads) => {
  const compactionInstructions = reads.flatMap((read) =>
    read.plainText?.as === 'compaction-instructions' ? [read.plainText.text] : [],
  );
  return compactionInstructions.length === 0
    ? NOTHING
    : { effects: { compactionInstructions }, issues: [] };
};

/**
 * `Stop` and `SubagentStop` (hooks.md, "Stop decision control"): `additionalContext` is "non-error
 * feedback for Claude. The conversation continues so Claude can act on it". Judgment
 * (spec/judgments.md): a hook that also returns `continue: false` stops instead, since that "takes
 * precedence over any event-specific decision fields" (hooks.md, "JSON output").
 */
export const mergeStop: Merger = (reads) => {
  const feedback = reads.some(
    (read) =>
      read.output?.continue !== false && textIn(read.specific, 'additionalContext') !== undefined,
  );
  return feedback ? { effects: { continuesTurn: true }, issues: [] } : NOTHING;
};

/** "Caps the notes for one tool call at 2,000 characters and truncates the rest." */
const CLASSIFIER_CAP = 2_000;

interface Rewrite {
  readonly read: Read;
  readonly value: unknown;
  readonly accepted: boolean;
}

/**
 * `updatedToolOutput` of a hook, or for an MCP tool its `updatedMCPToolOutput` ("Replaces the output
 * for MCP tools only. Prefer `updatedToolOutput`"). A built-in tool's value that does not match its
 * output shape is "ignored and the original output is used"; an MCP tool's is passed through.
 */
function rewriteOf(
  read: Read,
  specific: HookSpecificOutputOf<'PostToolUse'>,
  toolName: string,
): { rewrite?: Rewrite; issue?: PluginIssue } {
  const mcp = isMcpToolName(toolName);
  // A JSON `null` is a value: only `undefined` is "not returned".
  const own = specific.updatedToolOutput;
  const value = own === undefined && mcp ? specific.updatedMCPToolOutput : own;
  if (value === undefined) return {};
  if (mcp) return { rewrite: { read, value, accepted: true } };
  const checked = checkToolOutput(toolName, value);
  if (checked.accepted) return { rewrite: { read, value, accepted: true } };
  return {
    rewrite: { read, value, accepted: false },
    issue: warning(
      `hooks.PostToolUse.${read.handler.id}.updatedToolOutput`,
      `does not match the ${toolName} output shape and is ignored (${checked.message})`,
    ),
  };
}

/**
 * `PostToolUse` (hooks.md, "PostToolUse decision control" and "Annotate a result for the auto mode
 * classifier"): the last accepted rewrite wins (spec/judgments.md); a classifier note is dropped
 * when its own rewrite is rejected or replaced by another hook's, and kept when it has no rewrite.
 */
export const mergePostToolUse: Merger = (reads, facts) => {
  const toolName = factOf(facts, 'tool_name');
  const name = typeof toolName === 'string' ? toolName : '';
  const found = reads.map((read) => {
    const specific = specificOf('PostToolUse', read.specific);
    return specific === undefined ? {} : rewriteOf(read, specific, name);
  });
  const rewrites = found.flatMap(({ rewrite }) => (rewrite === undefined ? [] : [rewrite]));
  const issues = found.flatMap(({ issue }) => (issue === undefined ? [] : [issue]));
  const winner = rewrites.filter((rewrite) => rewrite.accepted).at(-1);
  const notes = reads.flatMap((read) => {
    const note = textIn(read.specific, 'classifierContext');
    const own = rewrites.find((rewrite) => rewrite.read === read);
    const survives = own === undefined || (own.accepted && own === winner);
    return note === undefined || !survives ? [] : [note];
  });
  const classifierContext =
    notes.length === 0 ? undefined : Array.from(notes.join('\n')).slice(0, CLASSIFIER_CAP).join('');
  return {
    effects: {
      ...(winner === undefined ? {} : { updatedToolOutput: winner.value }),
      ...(classifierContext === undefined ? {} : { classifierContext }),
    },
    issues,
  };
};

type ElicitationAction = NonNullable<HookSpecificOutputOf<'Elicitation'>['action']>;

/** The answers that override every other. */
const DECLINING: ReadonlySet<ElicitationAction> = new Set<ElicitationAction>(['decline']);

interface Answer {
  readonly read: Read;
  readonly action: ElicitationAction;
  readonly content: HookSpecificOutputOf<'Elicitation'>['content'];
}

/** A hook's answer: `decision: "block"` "overrides an `action` in the same output" and declines. */
function answerOf(read: Read, event: 'Elicitation' | 'ElicitationResult'): Answer | undefined {
  if (read.output?.decision === 'block') return { read, action: 'decline', content: undefined };
  const specific = specificOf(event, read.specific);
  // "Claude Code ignores a `hookSpecificOutput` that has no `action`."
  return specific?.action === undefined
    ? undefined
    : { read, action: specific.action, content: specific.content };
}

/**
 * `Elicitation` and `ElicitationResult` (hooks.md, "Elicitation output", "ElicitationResult
 * output"): "a decline from one of them overrides an `accept` or `cancel` from another". Judgment
 * (spec/judgments.md): between an `accept` and a `cancel` the first hook in registry order wins.
 */
export function mergeElicitation(
  event: 'Elicitation' | 'ElicitationResult',
  reads: readonly Read[],
): Merged {
  const answers = reads.flatMap((read) => {
    const answer = answerOf(read, event);
    return answer === undefined ? [] : [answer];
  });
  const chosen = answers.find((answer) => DECLINING.has(answer.action)) ?? answers[0];
  if (chosen === undefined) return NOTHING;
  const blocking = reads.find((read) => read.output?.decision === 'block');
  return {
    effects: {
      elicitation: {
        action: chosen.action,
        ...(chosen.content === undefined ? {} : { content: chosen.content }),
      },
    },
    issues: [],
    ...(blocking === undefined
      ? {}
      : { block: { via: 'decision' as const, by: blocking.handler.id } }),
  };
}
