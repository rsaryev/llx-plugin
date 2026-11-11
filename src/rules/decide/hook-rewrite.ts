import type { HookPermissionDecision, PermissionMode } from '../../protocol/official.ts';
import { canonicalJson } from '../../format/canonical-json.ts';

/**
 * A PreToolUse hook that returns `updatedInput` with no `permissionDecision` in auto mode (hooks.md,
 * "PreToolUse `updatedInput` in auto mode"): "Claude Code can deny the changed call", because "the
 * server reviewed the input Claude wrote, not the input your hook returned". This says what becomes
 * of the change. The review itself, the denial and the next response are the host's.
 */

/** "In interactive terminal sessions and VS Code sessions on a direct connection ... the denial includes this text". */
export const CHANGED_INPUT_DENIAL = "a hook changed this call's input after auto mode reviewed it";

/** The calls a `command` hook may change without the denial (in the sessions that show the text). */
const UNREVIEWED_CHANGES_OK: ReadonlySet<string> = new Set([
  'Bash',
  'PowerShell',
  'Monitor',
  'Edit',
  'Write',
  'NotebookEdit',
]);

export interface HookRewriteCall {
  readonly toolName: string;
  /** The input Claude wrote: what the server reviewed (on a repeat, the changed input Claude repeated). */
  readonly input: unknown;
  /** What the hook returned. */
  readonly updatedInput: unknown;
  /** The hook's `permissionDecision`; the denial applies only to a change with none. */
  readonly decision?: HookPermissionDecision;
}

export interface HookRewriteSession {
  readonly mode: PermissionMode;
  /** An interactive terminal or a VS Code session on a direct connection: the sessions that show the text. */
  readonly showsDenialText: boolean;
  /** The hook is a `command` hook in settings or in a plugin's hooks file. */
  readonly commandHook: boolean;
  /** Any hook changed an earlier call in the same Claude response. */
  readonly earlierChangeInResponse: boolean;
  /** The changed input of a call that was denied for this reason, so a repeat of it can be told. */
  readonly deniedChange?: unknown;
}

/** `apply`: the change runs. `deny`: auto mode refuses the changed call. `drop`: what runs is what the server reviewed. */
export type HookRewriteVerdict =
  | { readonly kind: 'apply' }
  | { readonly kind: 'drop' }
  | { readonly kind: 'deny'; readonly text?: string };

const REVIEWS: Record<PermissionMode, boolean> = {
  default: false,
  acceptEdits: false,
  bypassPermissions: false,
  plan: false,
  dontAsk: false,
  auto: true,
};
const APPLY: HookRewriteVerdict = { kind: 'apply' };

/** A Bash command that "asks to run outside the sandbox". */
const asksOutsideSandbox = (call: HookRewriteCall): boolean =>
  call.toolName === 'Bash' &&
  typeof call.input === 'object' &&
  call.input !== null &&
  'dangerouslyDisableSandbox' in call.input &&
  call.input.dangerouslyDisableSandbox === true;

/** Whether the session shows the denial and the call is one a command hook may change without it. */
const changeIsTolerated = (call: HookRewriteCall, session: HookRewriteSession): boolean =>
  session.showsDenialText &&
  session.commandHook &&
  UNREVIEWED_CHANGES_OK.has(call.toolName) &&
  !session.earlierChangeInResponse &&
  !asksOutsideSandbox(call);

/**
 * What auto mode does with a hook's `updatedInput`. A call Claude repeats with exactly the changed
 * input that was denied is a repeat: "your hook still runs ... Any `updatedInput` it returns is
 * dropped". Elsewhere the change is denied unless the hook decided the call itself, or the session
 * and the call are among the ones that "change ... without this denial". The docs describe the
 * exemption only for the sessions that show the text, so elsewhere a change is denied, without the
 * text (spec/judgments.md).
 */
export function reviewHookRewrite(
  call: HookRewriteCall,
  session: HookRewriteSession,
): HookRewriteVerdict {
  if (!REVIEWS[session.mode] || call.updatedInput === undefined) return APPLY;
  const repeated =
    session.deniedChange !== undefined &&
    canonicalJson(call.input) === canonicalJson(session.deniedChange);
  if (repeated) return { kind: 'drop' };
  if (call.decision !== undefined || changeIsTolerated(call, session)) return APPLY;
  return session.showsDenialText ? { kind: 'deny', text: CHANGED_INPUT_DENIAL } : { kind: 'deny' };
}
