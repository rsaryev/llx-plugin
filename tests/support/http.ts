import type { HttpClient, HttpFailure, HttpRequest, HttpResponse } from '../../src/ports/index.ts';

export type HttpReply = Partial<HttpResponse> | HttpFailure;

/**
 * An `HttpClient` that answers from a script, in order (status 200, no headers and an empty body
 * unless given), and records every request in `requests`. A spent script throws.
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
      return Promise.resolve({ status: 200, headers: {}, body: '', truncated: false, ...reply });
    },
  };
}
