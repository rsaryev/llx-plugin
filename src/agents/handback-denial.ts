/**
 * A hook that denies `SubagentHandback` (hooks.md, "PreToolUse `ask` decisions in auto mode"): "Claude
 * Code then tells the subagent, up to three times, that its report wasn't delivered and to call the
 * tool again. If your hook keeps denying, the subagent ends without delivering a report through this
 * tool, and the conversation waiting on it gets a note saying so." The tool call, the message to the
 * subagent and the note are the host's; this counts.
 */
export const HANDBACK_DENIALS_TOLD = 3;

export type HandbackAfterDenial =
  /** Tell the subagent its report was not delivered and to call the tool again. */
  | 'tell-subagent'
  /** End the subagent, and tell the conversation waiting on it that no report came through the tool. */
  | 'end-without-report';

/** What follows the `denials`-th denial of one subagent's handback (1 for the first). */
export const afterHandbackDenial = (denials: number): HandbackAfterDenial =>
  denials <= HANDBACK_DENIALS_TOLD ? 'tell-subagent' : 'end-without-report';
