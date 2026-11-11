/**
 * Whether a call a user's mod approved still reaches the auto-mode classifier (plugins/mods/admin.md,
 * "Know what happens by default", "A user's mod can still skip some prompts"): "In auto mode, a call the
 * mod approves runs without a classifier check, unless the guard is loaded and the session runs with
 * `--permission-prompt-tool` or an Agent SDK `canUseTool` callback. There the classifier checks the
 * call first."
 */
export interface ModApprovalFacts {
  /** The built-in guard is loaded in this session. */
  readonly guardLoaded: boolean;
  /** The session runs with `--permission-prompt-tool`. */
  readonly permissionPromptTool: boolean;
  /** The session is an Agent SDK session with a `canUseTool` callback. */
  readonly canUseTool: boolean;
}

/** True when the approved call runs without a classifier check. */
export const modApprovalSkipsClassifier = (facts: ModApprovalFacts): boolean =>
  !(facts.guardLoaded && (facts.permissionPromptTool || facts.canUseTool));
