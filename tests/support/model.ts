import type {
  AgentRequest,
  ModelAnswer,
  ModelRequest,
  ModelRunner,
  PortFailure,
} from '../../src/ports/index.ts';

export type ModelReply = ModelAnswer | PortFailure;

/** One recorded call: `tools` is present for `runAgent`, absent for `evaluate`. */
export type ModelCall = ModelRequest & { readonly tools?: AgentRequest['tools'] };

/**
 * A `ModelRunner` that answers `evaluate` and `runAgent` from one script, in order, and records
 * every call. A spent script throws.
 */
export function fakeModel(
  ...replies: readonly ModelReply[]
): ModelRunner & { readonly calls: ModelCall[] } {
  const calls: ModelCall[] = [];
  const answer = (request: ModelCall): Promise<ModelReply> => {
    const reply = replies[calls.length];
    calls.push(request);
    if (reply === undefined) {
      return Promise.reject(new Error(`fakeModel: no reply for call ${calls.length}`));
    }
    return Promise.resolve(reply);
  };
  return { calls, evaluate: answer, runAgent: answer };
}
