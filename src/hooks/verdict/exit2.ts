import type { HookEvent } from '../../protocol/official.ts';
import type { HookSource, HookSourceKind } from '../contracts.ts';

/**
 * What exit code 2 does on each event (hooks.md, "Exit code 2 behavior per event"): the table is
 * data, one row per event of the official union, so an event the SDK adds is a compile error here
 * and not a hook that silently lets everything through.
 */

/** What exit 2 does to the thing the event guards. */
export type Exit2Effect =
  | 'blocks-tool-call'
  | 'blocks-prompt'
  | 'blocks-expansion'
  | 'prevents-stop'
  | 'prevents-subagent-stop'
  | 'prevents-teammate-idle'
  | 'rolls-back-task-creation'
  | 'prevents-task-completion'
  | 'blocks-config-change'
  | 'stops-agentic-loop'
  | 'blocks-compaction'
  | 'blocks-model-switch'
  | 'declines-elicitation'
  | 'blocks-elicitation-response'
  | 'fails-worktree-creation'
  | 'fails-worktree-removal'
  /** The event guards nothing, or its table row says the exit code is not honored. */
  | 'none';

/** Where the stderr of an exit-2 hook goes. */
export type StderrChannel =
  /** Claude sees it: the denial reason, the tool's feedback, the next instruction. */
  | 'claude'
  /** The user sees it: a block message, a `<hook name> hook error` notice. */
  | 'user'
  | 'user-and-claude'
  /** Only the debug log ("Stderr goes to the debug log"; "A blocked change surfaces no message"). */
  | 'debug'
  /** "Exit code and stderr are ignored", "its stderr is discarded". */
  | 'discarded';

export interface Exit2Rule {
  /** "Can block?" of the table: exit 2 stops what the event guards. */
  readonly canBlock: boolean;
  readonly effect: Exit2Effect;
  readonly stderr: StderrChannel;
  /** `WorktreeCreate` and `WorktreeRemove`: "Any non-zero exit code" fails, not only 2. */
  readonly anyNonZeroBlocks?: boolean;
  /** `onFailure` has no effect: exit 2 "sends Claude back to keep working", a hook that won't run can't be repaired. */
  readonly ignoresOnFailure?: boolean;
  /** `PreModelSwitch`: "A PreModelSwitch hook that doesn't respond before its timeout blocks the switch." */
  readonly timeoutBlocks?: boolean;
  /** `PermissionRequest`: a failure with `onFailure: "block"` denies, though exit 2 is not honored. */
  readonly failureDenies?: boolean;
  /** "Claude Code applies your `hookSpecificOutput` when your hook exits 0, and ignores it on any other exit code." */
  readonly outputOnlyOnExit0?: boolean;
  /** `WorktreeRemove`: the failure counts only if the directory is still there afterwards. */
  readonly blocksUnlessDirectoryGone?: boolean;
  /** Exit 2 with nothing on stdout and a missing-file stderr is a non-blocking error for these sources. */
  readonly missingFileIsError?: (source: HookSource) => boolean;
  /** The event's own exception to blocking (`ConfigChange`: "`policy_settings` changes can't be blocked"). */
  readonly cannotBlockWhen?: (facts: object) => boolean;
}

const row = (
  canBlock: boolean,
  effect: Exit2Effect,
  stderr: StderrChannel,
  more: Omit<Exit2Rule, 'canBlock' | 'effect' | 'stderr'> = {},
): Exit2Rule => ({ canBlock, effect, stderr, ...more });

const blocks = (effect: Exit2Effect, stderr: StderrChannel, more?: Parameters<typeof row>[3]) =>
  row(true, effect, stderr, more);
const ignored = (stderr: StderrChannel) => row(false, 'none', stderr);

/** "Stop, SubagentStop, TaskCompleted, and a plugin's UserPromptSubmit hook": a missing file is not a block. */
const anySource = (): boolean => true;
const PLUGIN_SOURCES: { readonly [K in HookSourceKind]: boolean } = {
  plugin: true,
  settings: false,
  skill: false,
  agent: false,
  session: false,
};
const pluginOnly = (source: HookSource): boolean => PLUGIN_SOURCES[source.kind];

const POLICY_SETTINGS = 'policy_settings';
const isPolicySettings = (facts: object): boolean =>
  'source' in facts && facts.source === POLICY_SETTINGS;

/** The `onFailure`-exempt events: exit 2 there sends Claude back to work. */
const KEEPS_WORKING = { ignoresOnFailure: true, missingFileIsError: anySource } as const;

export const EXIT2_RULES: { readonly [E in HookEvent]: Exit2Rule } = {
  PreToolUse: blocks('blocks-tool-call', 'claude'),
  PermissionRequest: row(false, 'none', 'discarded', { failureDenies: true }),
  UserPromptSubmit: blocks('blocks-prompt', 'user', { missingFileIsError: pluginOnly }),
  UserPromptExpansion: blocks('blocks-expansion', 'user'),
  Stop: blocks('prevents-stop', 'claude', KEEPS_WORKING),
  SubagentStop: blocks('prevents-subagent-stop', 'claude', KEEPS_WORKING),
  TeammateIdle: blocks('prevents-teammate-idle', 'claude', { ignoresOnFailure: true }),
  TaskCreated: blocks('rolls-back-task-creation', 'claude'),
  TaskCompleted: blocks('prevents-task-completion', 'claude', KEEPS_WORKING),
  ConfigChange: blocks('blocks-config-change', 'debug', { cannotBlockWhen: isPolicySettings }),
  StopFailure: ignored('discarded'),
  PostToolUse: ignored('claude'),
  PostToolUseFailure: ignored('claude'),
  PostToolBatch: blocks('stops-agentic-loop', 'user-and-claude'),
  PermissionDenied: ignored('discarded'),
  Notification: ignored('discarded'),
  SubagentStart: ignored('user'),
  SessionStart: ignored('user'),
  Setup: ignored('discarded'),
  SessionEnd: ignored('user'),
  CwdChanged: ignored('user'),
  DirectoryAdded: ignored('debug'),
  FileChanged: ignored('user'),
  PreCompact: blocks('blocks-compaction', 'user'),
  PostCompact: ignored('user'),
  PreModelSwitch: blocks('blocks-model-switch', 'user', { timeoutBlocks: true }),
  PostModelSwitch: ignored('user'),
  Elicitation: blocks('declines-elicitation', 'discarded', { outputOnlyOnExit0: true }),
  ElicitationResult: blocks('blocks-elicitation-response', 'discarded', {
    outputOnlyOnExit0: true,
  }),
  // Judgment (spec/judgments.md): the docs give the exit code of WorktreeCreate no stderr route.
  WorktreeCreate: blocks('fails-worktree-creation', 'debug', { anyNonZeroBlocks: true }),
  WorktreeRemove: blocks('fails-worktree-removal', 'debug', {
    anyNonZeroBlocks: true,
    blocksUnlessDirectoryGone: true,
  }),
  InstructionsLoaded: ignored('discarded'),
  // Judgment (spec/judgments.md): "The original text is displayed" says nothing of stderr.
  MessageDisplay: ignored('discarded'),
};
