import type { PluginIssue } from '../../format/issues.ts';
import type { HookEvent } from '../../protocol/official.ts';
import type { RegisteredHandler } from '../contracts.ts';
import type { StartObserver } from '../handlers/status.ts';

/** The host's window onto a dispatch: `started` is the run stage's, the others the engine's. */
export interface HookObserver extends StartObserver {
  /** A handler's run was read: what it came to, and whether it blocked. */
  finished?(info: {
    readonly event: HookEvent;
    readonly handlerId: string;
    readonly status: HandlerStatus;
  }): void;
  /** A `<hook name> hook error` notice for the transcript. */
  notice?(notice: HookNotice): void;
}

// ---- verdict stage: what a run came to (hooks.md, "Exit code output") ----

/**
 * A hook's parsed JSON output, as the output stage (`hooks/output`) types it per event. The verdict
 * stage never reads a field of it: it only decides whether the output counts, and hands it on.
 */
export type ParsedOutput = object;

/** The output stage's reading of one JSON value (`parseHookOutput`): the output, or why it failed. */
export interface ParseResult {
  readonly output?: ParsedOutput;
  readonly failure?: string;
}
export type ParseOutput = (event: HookEvent, json: unknown) => ParseResult;

/** What a hook's run came to. */
export type HandlerStatus =
  | 'success'
  | 'blocked'
  | 'non-blocking-error'
  | 'timed-out'
  | 'cancelled'
  | 'skipped'
  | 'background';

/** Why the action is held back, and how it was decided. */
export type BlockVia = 'exit2' | 'decision' | 'failure' | 'continue-false' | 'timeout';

/** The action is held back; `reason` is the text Claude or the user is given, as the docs route it. */
export interface BlockInfo {
  readonly via: BlockVia;
  /** The hook's own words: its stderr, or the failure text. */
  readonly reason: string;
  /** The line the docs show, `<Event>:<tool> hook error: [<command>]: <reason>`. */
  readonly message: string;
  /** `WorktreeRemove` only: it fails "if the directory still exists afterward". */
  readonly condition?: 'worktree-directory-remains';
}

/** A `<hook name> hook error` notice, verbatim as the docs show it. */
export interface HookNotice {
  readonly handlerId: string;
  readonly message: string;
}

/** Text from a hook that goes to Claude or to the user without blocking anything. */
export interface Feedback {
  readonly handlerId: string;
  readonly to: 'claude' | 'user';
  readonly text: string;
}

/** What `async` and `asyncRewake` hooks hand over once their process ends. */
export interface BackgroundDelivery {
  readonly handlerId: string;
  /** `additionalContext` of the JSON response, for the next turn. */
  readonly additionalContext?: string;
  /** `systemMessage` of the JSON response, for Claude on the next turn. */
  readonly systemMessage?: string;
  /** `asyncRewake` after exit 2: wakes Claude with this text. */
  readonly wake?: string;
}

/** The reading of one handler's run. */
export interface HandlerVerdict {
  readonly handler: RegisteredHandler;
  readonly status: HandlerStatus;
  /** The run counts as a success for `once`: no block, no error, no timeout. */
  readonly succeeded: boolean;
  readonly block?: BlockInfo;
  /** The turn ends with this reason (`ok: false` of a prompt or agent hook that ends the turn). */
  readonly stop?: { readonly reason: string };
  /** JSON fields that apply; absent when the run's exit code or output makes them not count. */
  readonly output?: ParsedOutput;
  /** Plain stdout an event adds to Claude's context, or `PreCompact` to the compaction instructions. */
  readonly plainText?: {
    readonly text: string;
    readonly as: 'context' | 'compaction-instructions';
  };
  /** Raw stdout of a `WorktreeCreate` command hook: its last non-empty line is the worktree path. */
  readonly stdout?: string;
  readonly feedback?: Feedback;
  readonly notice?: HookNotice;
  /** A Monitor call reached the hook through a `Bash` matcher: its `allow` and `updatedInput` do not apply. */
  readonly effectsIgnored?: boolean;
  readonly delivery?: Promise<BackgroundDelivery>;
  readonly issues: readonly PluginIssue[];
}

/** One handler's output as the merge reads it. */
export interface TaggedOutput {
  readonly handler: RegisteredHandler;
  readonly output?: ParsedOutput;
  readonly plainText?: HandlerVerdict['plainText'];
  readonly effectsIgnored?: boolean;
}

/** What the per-event effects of a merged output are; typed by the output stage. */
export type EventEffects = Readonly<Record<string, unknown>>;

/** The merge of every hook's output on one event (hooks hold no knowledge of its rules). */
export interface MergedOutput {
  readonly block?: {
    readonly via: 'decision' | 'continue-false';
    readonly by: string;
    readonly reason?: string;
  };
  readonly continue: boolean;
  readonly stopReason?: string;
  readonly systemMessages: readonly string[];
  readonly additionalContext: readonly string[];
  readonly terminalSequences: readonly string[];
  readonly effects: EventEffects;
}

/** The output stage the verdict and the dispatch lean on: `hooks/output` implements it. */
export interface OutputStage {
  readonly parse: ParseOutput;
  merge(event: HookEvent, outputs: readonly TaggedOutput[]): MergedOutput;
}
