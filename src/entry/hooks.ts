/** `@rsaryev/llx-plugin/hooks`: The hook engine: selection, input, handlers, verdicts, dispatch and output (docs/API.md, "Hooks"). */
export { HOOK_EVENTS } from '../protocol/hook-events.ts';
export type {
  EventWithSpecificOutput,
  HookInputOf,
  HookSpecificOutput,
  HookSpecificOutputOf,
} from '../protocol/hook-events.ts';
export { HOOK_HANDLER_TYPES } from '../protocol/hook-config.ts';
export type {
  HookHandler,
  HookHandlerOf,
  HookHandlerType,
  HookMatcherGroup,
  HooksSettings,
} from '../protocol/hook-config.ts';
export * from '../hooks/index.ts';
