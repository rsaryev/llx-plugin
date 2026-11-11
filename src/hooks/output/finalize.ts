import type { HookEvent } from '../../protocol/official.ts';
import type { BlockInfo } from '../verdict/types.ts';
import type { EventEffects } from './effects.ts';
import { hasText } from './fields.ts';

/**
 * A block that is not a JSON decision (an exit-2 hook, a failure) holds the action back, so the
 * effects the merge computed from the other hooks must agree with it: "precedence is `deny` >
 * `defer` > `ask` > `allow`", "a decline from one of them overrides an `accept` or `cancel` from
 * another" (hooks.md, "PreToolUse decision control", "Other ways to decline an elicitation").
 */

type OnBlock = (effects: EventEffects, block: BlockInfo) => EventEffects;

const denyTool: OnBlock = (effects, block) => {
  const { updatedInput: _dropped, ...rest } = effects;
  return {
    ...rest,
    permissionDecision: 'deny',
    ...(hasText(block.reason)
      ? { permissionDecisionReason: block.reason }
      : rest.permissionDecisionReason === undefined
        ? {}
        : { permissionDecisionReason: rest.permissionDecisionReason }),
  };
};

/**
 * Only a failure that "denies" blocks a `PermissionRequest`; its text is the denial's `message`. A
 * deny a hook decided keeps its own `interrupt` ("if `true`, stops Claude").
 */
const denyRequest: OnBlock = (effects, block) => {
  const decided = effects.permissionRequest;
  const interrupt = decided?.behavior === 'deny' && decided.interrupt === true;
  return {
    ...effects,
    permissionRequest: {
      behavior: 'deny',
      ...(hasText(block.reason) ? { message: block.reason } : {}),
      ...(interrupt ? { interrupt } : {}),
    },
  };
};

const decline: OnBlock = (effects) => {
  const { elicitation: _answer, ...rest } = effects;
  return { ...rest, elicitation: { action: 'decline' } };
};

const ON_BLOCK: { readonly [E in HookEvent]?: OnBlock } = {
  PreToolUse: denyTool,
  PreModelSwitch: denyTool,
  PermissionRequest: denyRequest,
  Elicitation: decline,
  ElicitationResult: decline,
};

export const finalizeEffects = (
  event: HookEvent,
  effects: EventEffects,
  block: BlockInfo | undefined,
): EventEffects => (block === undefined ? effects : (ON_BLOCK[event]?.(effects, block) ?? effects));
