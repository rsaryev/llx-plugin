import type { PortFailure } from './failure.ts';

export interface ModelAnswer {
  readonly text: string;
}

/** A model call that is no more than a prompt: the host picks the model when `model` is absent. */
export interface ModelRequest {
  readonly prompt: string;
  readonly model?: string;
  /** When no model is named, prompt/agent hook verifiers request a small, fast model. */
  readonly modelPreference?: 'small-fast';
  readonly timeoutMs?: number;
  readonly signal: AbortSignal;
}

/** A multi-turn run that may use the named tools (an `agent` hook's verifier). */
export interface AgentRequest extends ModelRequest {
  readonly tools: readonly string[];
  /** The verifier must never gain write capabilities, even through a named tool. */
  readonly readOnly: true;
  /** The host must stop its tool-using verifier loop at this bound. */
  readonly maxTurns: number;
}

export interface ModelRunner {
  /** One turn, no tools: `prompt` hooks and a mod's `$.model`. */
  evaluate(request: ModelRequest): Promise<ModelAnswer | PortFailure>;
  /** An agent verifier run, enforcing readOnly and maxTurns as well as timeout/signal. */
  runAgent(request: AgentRequest): Promise<ModelAnswer | PortFailure>;
}
