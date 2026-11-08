import type { SessionOptions } from './session-types.ts';

/**
 * What a turn may change over the session it runs in (docs/API.md, "Host and sessions", "Turns"):
 * the mode, effort, folders, shell answer and model limits of that turn, the prompt and agent the hooks report,
 * and whether it is interactive. Whatever a turn leaves out stays what the session had.
 *
 * Judgment (spec/judgments.md): `sessionId`, `transcriptPath` and `trusted` are not here. They
 * name the session and its workspace trust, which a turn does not change; `interactive` is here
 * because the same session can serve a `-p` turn and an interactive one.
 */
export type TurnOptions = Partial<
  Pick<
    SessionOptions,
    | 'permissionMode'
    | 'effort'
    | 'cwd'
    | 'additionalDirectories'
    | 'permissions'
    | 'promptId'
    | 'scratchpadDir'
    | 'agent'
    | 'folderTrustAccepted'
    | 'interactive'
    | 'limits'
  >
>;

/** The fields a turn may change; a field added to `TurnOptions` without a row here does not compile. */
const TURN_FIELDS: { readonly [K in keyof Required<TurnOptions>]: true } = {
  permissionMode: true,
  effort: true,
  cwd: true,
  additionalDirectories: true,
  permissions: true,
  promptId: true,
  scratchpadDir: true,
  agent: true,
  folderTrustAccepted: true,
  interactive: true,
  limits: true,
};

const isTurnKey = (key: string): key is keyof TurnOptions => Object.hasOwn(TURN_FIELDS, key);

/**
 * The options of a turn over the ones before it: each field the turn gives replaces the one it had
 * (an `agent` and `limits` replace whole), the others stay. A field given as `undefined`, and any key a turn
 * may not change, is ignored: a turn cannot unset a field, only replace it.
 */
export function applyTurn(base: SessionOptions, turn: TurnOptions): SessionOptions {
  const given: TurnOptions = Object.fromEntries(
    Object.entries(turn).filter(([key, value]) => isTurnKey(key) && value !== undefined),
  );
  return { ...base, ...given };
}
