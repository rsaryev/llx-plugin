import type { SDKPermissionDeniedMessage, SDKResultError } from '../../protocol/official.ts';

/**
 * The messages of `permissions.denyInsteadOfPrompting` (settings-reference.md, "Messages from
 * `denyInsteadOfPrompting`"), verbatim: they report refused calls and nothing waits on them. The
 * host writes them where the docs put them; the kit holds the texts and the count of refusals.
 */

/** "The denial Claude reads can open with this text." */
export const NO_APPROVAL_SURFACE_DENIAL =
  'Permission for this tool use was denied. It requires approval, and this session has no approval surface';

/** The `decision_reason` of a `permission_denied` message in `stream-json` output. */
export const NO_APPROVAL_SURFACE_DECISION_REASON: NonNullable<
  SDKPermissionDeniedMessage['decision_reason']
> = 'no approval surface in this session; permission request denied automatically';

/** "The turn ends after 20 calls in a row that the classifier blocked or a safety check refused". */
export const REFUSAL_STOP_LIMIT = 20;

/** What the person sees when those refusals end the turn. */
export const REFUSAL_STOP_MESSAGE =
  '20 actions were refused and no work went ahead in between, so Claude stopped.';

/** "A `-p` run reports that turn as `error_during_execution`." */
export const REFUSAL_STOP_RESULT: SDKResultError['subtype'] = 'error_during_execution';

/** One call of an auto mode turn: refused by the classifier or a safety check, or work that went ahead. */
export type RefusalEvent = 'refused' | 'went-ahead';

/** Where the turn stands after a call: it goes on, or it ends with the message. */
export type RefusalVerdict =
  | { readonly outcome: 'continue' }
  | { readonly outcome: 'stop'; readonly message: string };

export interface RefusalStreak {
  /** Records a call and says whether the turn ends. */
  record(event: RefusalEvent): RefusalVerdict;
}

const CONTINUE: RefusalVerdict = { outcome: 'continue' };
const STOP: RefusalVerdict = { outcome: 'stop', message: REFUSAL_STOP_MESSAGE };

/** How each call moves the count: a refusal adds one, work that went ahead starts it over. */
const STEP: { readonly [E in RefusalEvent]: (count: number) => number } = {
  refused: (count) => count + 1,
  'went-ahead': () => 0,
};

/**
 * The count of one turn "in auto mode with the setting on": 20 refusals in a row, with "no work
 * went ahead in between", end it. A host makes one per turn, and only in that case.
 */
export function createRefusalStreak(): RefusalStreak {
  let count = 0;
  return {
    record(event) {
      count = STEP[event](count);
      return count >= REFUSAL_STOP_LIMIT ? STOP : CONTINUE;
    },
  };
}
