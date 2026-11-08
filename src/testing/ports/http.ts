import type { HttpClient, HttpFailure, HttpRequest, HttpResponse } from '../../ports/index.ts';

export type HttpReply = Partial<HttpResponse> | HttpFailure;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * The reply as the request asked for it: `as: 'bytes'` answers with `bytes` (a text `body` is
 * encoded) and an empty `body`; text answers with `body` (given `bytes` are decoded). `maxBytes`
 * cuts the body and sets `truncated`, as a real client does.
 */
function shaped(request: HttpRequest, reply: Partial<HttpResponse>): HttpResponse {
  const raw = reply.bytes ?? encoder.encode(reply.body ?? '');
  const cut = request.maxBytes !== undefined && raw.length > request.maxBytes;
  const bytes = cut ? raw.slice(0, request.maxBytes) : raw;
  const meta = {
    status: reply.status ?? 200,
    headers: reply.headers ?? {},
    truncated: reply.truncated === true || cut,
  };
  return request.as === 'bytes'
    ? { ...meta, body: '', bytes }
    : { ...meta, body: decoder.decode(bytes) };
}

/**
 * An `HttpClient` that answers from a script, in order (status 200, no headers and an empty body
 * unless given; see `shaped` for `as` and `maxBytes`), and records every request in `requests`. A spent script throws.
 */
export function recordingHttp(
  ...replies: readonly HttpReply[]
): HttpClient & { readonly requests: HttpRequest[] } {
  const requests: HttpRequest[] = [];
  return {
    requests,
    request: (request) => {
      const index = requests.length;
      requests.push(request);
      const reply = replies[index];
      if (reply === undefined) {
        return Promise.reject(new Error(`recordingHttp: no reply for request ${index + 1}`));
      }
      if ('failure' in reply) return Promise.resolve(reply);
      return Promise.resolve(shaped(request, reply));
    },
  };
}
