import type {
  AgentRequest,
  ModelAnswer,
  ModelRequest,
  ModelRunner,
  PortFailure,
} from '../../ports/index.ts';

export type ModelReply = ModelAnswer | PortFailure;

/** The agent verifier's tool and safety limits are present only for `runAgent`. */
export type RecordedModelCall = ModelRequest &
  Partial<Pick<AgentRequest, 'tools' | 'readOnly' | 'maxTurns'>>;

/**
 * A `ModelRunner` that answers `evaluate` and `runAgent` from one script, in order, and records
 * every call. A spent script throws.
 */
export function fakeModel(
  ...replies: readonly ModelReply[]
): ModelRunner & { readonly calls: RecordedModelCall[] } {
  const calls: RecordedModelCall[] = [];
  const answer = (request: RecordedModelCall): Promise<ModelReply> => {
    const reply = replies[calls.length];
    calls.push(request);
    if (reply === undefined) {
      return Promise.reject(new Error(`fakeModel: no reply for call ${calls.length}`));
    }
    return Promise.resolve(reply);
  };
  return { calls, evaluate: answer, runAgent: answer };
}
