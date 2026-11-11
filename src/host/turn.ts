import type { SessionOptions } from './session-types.ts';

/**
 * What a turn may change over the session it runs in (docs/API.md, "Host and sessions", "Turns"):
 * the mode, effort, folders, shell answer and model limits of that turn, the prompt and agent the hooks report,
 * and whether it is interactive. Whatever a turn leaves out stays what the session had.
 *
 * Judgment (spec/judgments.md): `sessionId`, `transcriptPath` and `trusted` are not here. They
 * name the session and its workspace trust, which a turn does not change; `interactive` is here
 * because the same session can serve a `-p` turn and an interactive one; `ports` is here
 * because a host binds the model evaluators, MCP caller and observer of the run it serves, and a
 * session outlives its runs (the turn's ports replace the session's whole). `locations` is not
 * here: the project folder is where the session started (hooks.md, "Worktrees are different"). A field given as
 * `undefined` is ignored, as in `HostUpdate`.
 */
export type TurnOptions = {
  readonly [
    K in
      | 'permissionMode'
      | 'effort'
      | 'cwd'
      | 'additionalDirectories'
      | 'shellPermission'
      | 'promptId'
      | 'scratchpadDir'
      | 'agent'
      | 'folderTrustAccepted'
      | 'interactive'
      | 'limits'
      | 'ports'
  ]?: SessionOptions[K] | undefined;
};

/** The fields a turn may change; a field added to `TurnOptions` without a row here does not compile. */
const TURN_FIELDS: { readonly [K in keyof Required<TurnOptions>]: true } = {
  permissionMode: true,
  effort: true,
  cwd: true,
  additionalDirectories: true,
  shellPermission: true,
  promptId: true,
  scratchpadDir: true,
  agent: true,
  folderTrustAccepted: true,
  interactive: true,
  limits: true,
  ports: true,
};

const isTurnKey = (key: string): key is keyof TurnOptions => Object.hasOwn(TURN_FIELDS, key);

/**
 * The options of a turn over the ones before it: each field the turn gives replaces the one it had
 * (an `agent` and `limits` replace whole), the others stay. A field given as `undefined`, and any key a turn
 * may not change, is ignored: a turn cannot unset a field, only replace it.
 */
export function applyTurn(base: SessionOptions, turn: TurnOptions): SessionOptions {
  // The filter drops each `undefined`, so what is left is a set of session fields.
  const given: Partial<Pick<SessionOptions, keyof TurnOptions>> = Object.fromEntries(
    Object.entries(turn).filter(([key, value]) => isTurnKey(key) && value !== undefined),
  );
  return { ...base, ...given };
}
