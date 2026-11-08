import type { PortFailure } from './failure.ts';

export interface ModelAnswer {
  readonly text: string;
}

/** A model call that is no more than a prompt: the host picks the model when `model` is absent. */
export interface ModelRequest {
  readonly prompt: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly signal: AbortSignal;
}

/** A multi-turn run that may use the named tools (an `agent` hook's verifier). */
export interface AgentRequest extends ModelRequest {
  readonly tools: readonly string[];
}

export interface ModelRunner {
  /** One turn, no tools: `prompt` hooks and a mod's `$.model`. */
  evaluate(request: ModelRequest): Promise<ModelAnswer | PortFailure>;
  /** A tool-using run to completion: `agent` hooks. */
  runAgent(request: AgentRequest): Promise<ModelAnswer | PortFailure>;
}
