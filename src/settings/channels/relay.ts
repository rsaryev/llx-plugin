import { inputPreview, relayDescription } from './sanitize.ts';

/**
 * Permission relay's request side (channels-reference.md, "Relay permission prompts"): the IDs Claude Code
 * issues, the four fields of a request, and the rule that applies a verdict only when its ID matches an
 * open request.
 */

/** "Five lowercase letters drawn from `a`-`z` without `l`." */
const REQUEST_ID_ALPHABET = 'abcdefghijkmnopqrstuvwxyz';
const REQUEST_ID_LENGTH = 5;

/** The `notifications/claude/channel/permission_request` params. */
export interface PermissionRequestParams {
  readonly request_id: string;
  readonly tool_name: string;
  readonly description: string;
  readonly input_preview: string;
}

/** The `notifications/claude/channel/permission` params a channel sends back. */
export interface PermissionVerdictParams {
  readonly request_id: string;
  readonly behavior: 'allow' | 'deny';
}

export interface RelayToolCall {
  readonly toolName: string;
  readonly description?: string;
  readonly input: Readonly<Record<string, unknown>>;
}

export type RelayOutcome =
  | { readonly applied: true; readonly behavior: 'allow' | 'deny' }
  | { readonly applied: false };

export interface PermissionRelay {
  /** Opens a request for a permission prompt and returns what to notify the channel with. */
  open(call: RelayToolCall): PermissionRequestParams;
  /** A verdict from a channel: applied "only if the ID matches an open request". */
  verdict(params: PermissionVerdictParams): RelayOutcome;
  /** Someone answered at the terminal: "that answer is applied instead and the pending remote request is dropped". */
  answerLocally(requestId: string): void;
}

/** `random` returns a number in [0, 1), the host's source of randomness (L3). */
export function createPermissionRelay(random: () => number): PermissionRelay {
  const open = new Set<string>();
  const issued = new Set<string>();
  const repeated = new Set<string>();
  const newId = (): string =>
    Array.from(
      { length: REQUEST_ID_LENGTH },
      () => REQUEST_ID_ALPHABET[Math.floor(random() * REQUEST_ID_ALPHABET.length)],
    ).join('');
  return {
    open(call) {
      const id = newId();
      // "Once an ID repeats, Claude Code drops any channel verdict carrying it."
      if (issued.has(id)) repeated.add(id);
      issued.add(id);
      open.add(id);
      return {
        request_id: id,
        tool_name: call.toolName,
        description: relayDescription(call.description),
        input_preview: inputPreview(call.input),
      };
    },
    verdict(params) {
      const id = params.request_id;
      if (!open.has(id) || repeated.has(id)) return { applied: false };
      open.delete(id);
      return { applied: true, behavior: params.behavior };
    },
    answerLocally(requestId) {
      open.delete(requestId);
    },
  };
}
