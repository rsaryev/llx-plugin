import type { PermissionMode } from '../../protocol/official.ts';
import { guardOption, flagSetting, type ModsPolicyInput } from './policy-input.ts';

/**
 * A mod Claude writes in a session (plugins/mods/create.md, "Ask Claude for a mod" and "Sessions
 * where a mod Claude writes can't load"; troubleshoot.md, "Claude Code stops asking to enable hot
 * reloading"): it loads only after the person approves it, in a trusted workspace where mods may run.
 */

/** The three ways the page lists a session where it cannot load. */
export type WrittenModGate = 'no-approver' | 'untrusted' | 'disabled';

export interface WrittenModSession {
  /** False for a session that cannot show a prompt, such as a `claude -p` run. */
  readonly isInteractive: boolean;
  readonly permissionMode?: PermissionMode;
}

export interface WrittenModRefusal {
  readonly gate: WrittenModGate;
  /** Wording ours (judgment): the page names the three sessions and no message. */
  readonly reason: string;
}

type Check = (policy: ModsPolicyInput, session: WrittenModSession) => string | undefined;

/** The permission modes whose sessions cannot show the prompt: `dontAsk` answers nothing itself. */
const CANNOT_ASK: { readonly [M in PermissionMode]: boolean } = {
  default: false,
  acceptEdits: false,
  bypassPermissions: false,
  plan: false,
  dontAsk: true,
  auto: false,
};

const noApprover: Check = (_policy, session) =>
  !session.isInteractive || CANNOT_ASK[session.permissionMode ?? 'default']
    ? 'nobody is there to approve it: the session cannot show a prompt'
    : undefined;

const untrusted: Check = (policy) =>
  policy.isTrusted === false
    ? 'the workspace is not trusted: accept the trust prompt first'
    : undefined;

/** `--safe-mode` and `--bare`, `disableAllHooks`, and what managed settings do to mods Claude writes. */
const disabled: Check = (policy) => {
  const reasons: readonly [boolean, string][] = [
    [policy.flags.safeMode === true, '--safe-mode turns mods off'],
    [policy.flags.bare === true, '--bare turns mods off'],
    [flagSetting(policy.user, 'disableAllHooks'), 'disableAllHooks is set in your settings'],
    [flagSetting(policy.managed, 'disableAllHooks'), 'disableAllHooks is set in managed settings'],
    [
      flagSetting(policy.managed, 'disableSideloadFlags'),
      'managed settings set disableSideloadFlags',
    ],
    // Judgment: the page says managed settings "block it" without naming the keys beyond disableSideloadFlags.
    [
      flagSetting(policy.managed, 'allowManagedHooksOnly'),
      'managed settings allow only managed hooks',
    ],
    [
      guardOption(policy, 'allowManagedModsOnly'),
      "managed settings allow only your organization's mods",
    ],
  ];
  return reasons.find(([on]) => on)?.[1];
};

/** In the order a person would read them: who can approve, whether the folder is trusted, whether mods run. */
const GATES: readonly (readonly [WrittenModGate, Check])[] = [
  ['no-approver', noApprover],
  ['untrusted', untrusted],
  ['disabled', disabled],
];

/** Why a mod Claude wrote cannot load in this session, or `undefined` when it can once it is approved. */
export function writtenModRefusal(
  policy: ModsPolicyInput,
  session: WrittenModSession,
): WrittenModRefusal | undefined {
  for (const [gate, check] of GATES) {
    const reason = check(policy, session);
    if (reason !== undefined) return { gate, reason };
  }
  return undefined;
}

/** What became of the hot-reloading question (create.md, "Approve the mod"). */
export type HotReloadAnswer = 'enable' | 'not-now' | 'unanswered' | 'dismissed';

/** What a host keeps for the gate, so a resumed session still knows (create.md: "Your answer lasts for the session, including after you resume it"). */
export interface HotReloadState {
  readonly enabled: boolean;
  /** The question ended with no answer picked (a timeout such as `askUserQuestionTimeout`). */
  readonly unanswered: number;
  /** The person picked `Not now`. */
  readonly declined: boolean;
}

export interface HotReloadGate {
  /** Whether Claude Code asks when Claude saves a file in the mods folder. */
  shouldAsk(): boolean;
  /** Whether the mods in the session's mods folder load and reload. */
  enabled(): boolean;
  answered(answer: HotReloadAnswer): void;
  state(): HotReloadState;
}

/** "If the question ends three times without an answer picked, hot reloading stays off." */
export const UNANSWERED_LIMIT = 3;

/**
 * The question of whether to enable hot reloading. `Enable for this session` turns it on and ends the
 * question; three questions that end unanswered leave it off and end it; a question the person
 * dismisses counts for nothing. Judgment: `Not now` ends the question for the session too (the page
 * says the mods load "the next time that session starts"), and the counts of unanswered questions
 * add up, an answer picked in between does not reset them.
 */
export function createHotReloadGate(initial?: HotReloadState): HotReloadGate {
  let state: HotReloadState = initial ?? { enabled: false, unanswered: 0, declined: false };
  const next: { readonly [A in HotReloadAnswer]: (from: HotReloadState) => HotReloadState } = {
    enable: (from) => ({ ...from, enabled: true }),
    'not-now': (from) => ({ ...from, declined: true }),
    unanswered: (from) => ({ ...from, unanswered: from.unanswered + 1 }),
    dismissed: (from) => from,
  };
  return {
    shouldAsk: () => !state.enabled && !state.declined && state.unanswered < UNANSWERED_LIMIT,
    enabled: () => state.enabled,
    answered(answer) {
      state = next[answer](state);
    },
    state: () => state,
  };
}
