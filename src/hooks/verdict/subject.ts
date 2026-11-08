import type { HookEvent } from '../../protocol/official.ts';
import type { RegisteredHandler } from '../contracts.ts';
import type { ParseOutput } from './types.ts';

/** What reading one run needs to know about the call it belongs to. */
export interface Subject {
  readonly entry: RegisteredHandler;
  readonly event: HookEvent;
  /** The facts the event fired with (`source` of `ConfigChange`). */
  readonly facts: object;
  /** `Bash` of a `PreToolUse:Bash` hook; absent on an event with no tool. */
  readonly toolName: string | undefined;
  /** The output stage's reading of a JSON value. */
  readonly parse: ParseOutput;
  /** A Monitor call reached the hook through a `Bash` matcher ("allow and updatedInput have no effect"). */
  readonly effectsIgnored: boolean;
  /** The limit the run was given in milliseconds, for the notice of a timeout; absent for none. */
  readonly timeoutMs: number | undefined;
  /** Windows without Git Bash: a shell-form `PreToolUse` or `PermissionRequest` hook is a gate (hooks.md, "Failed hooks on Windows without Git Bash"). */
  readonly gitBashMissing: boolean;
}
