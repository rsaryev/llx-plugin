/** Where a subagent's permission prompts appear (tools-reference.md, "Agent tool behavior"). */
export interface SubagentPromptSurface {
  /** `call`: the same prompts as the main conversation, "at the moment each tool call happens"; `main-session`: surfaced in the main session. */
  readonly appearsIn: 'call' | 'main-session';
  /** "The prompt names which subagent is asking." */
  readonly namesSubagent: boolean;
  /** "Pressing Esc denies that one tool call without stopping the subagent." */
  readonly escDeniesOneCall: boolean;
}

const SURFACES: { readonly [Mode in 'foreground' | 'background']: SubagentPromptSurface } = {
  foreground: { appearsIn: 'call', namesSubagent: false, escDeniesOneCall: false },
  background: { appearsIn: 'main-session', namesSubagent: true, escDeniesOneCall: true },
};

/**
 * "Launching the subagent doesn't itself prompt for permission": its own tool calls are checked
 * against the permission rules as it runs, and where the prompt shows depends on whether it runs in
 * the foreground or the background. Judgment (spec/judgments.md): the foreground prompt does not name
 * the subagent, because the docs say it is the one the main conversation shows.
 */
export const permissionSubagentPromptSurface = (background: boolean): SubagentPromptSurface =>
  SURFACES[background ? 'background' : 'foreground'];
