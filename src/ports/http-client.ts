import type { PortFailure } from './failure.ts';

/** One HTTP request. Header names are lower case in both directions. */
export interface HttpRequest {
  readonly method: 'GET' | 'POST';
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  /**
   * How the response body comes back: `text` (the default) decodes it as UTF-8 into
   * `HttpResponse.body`; `bytes` leaves it undecoded in `HttpResponse.bytes` (archives, which text
   * would corrupt).
   */
  readonly as?: 'text' | 'bytes';
  readonly timeoutMs?: number;
  /** Stop reading the body at this many bytes (not characters); the response says `truncated`. */
  readonly maxBytes?: number;
  /** `manual` returns a redirect as it is (status and `location`) so the kit can judge each hop. */
  readonly redirect?: 'follow' | 'manual';
  readonly signal: AbortSignal;
}

export interface HttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  /** The decoded body when the request was `as: 'text'`; empty when it was `as: 'bytes'`. */
  readonly body: string;
  /** The raw body when the request was `as: 'bytes'`; absent otherwise. */
  readonly bytes?: Uint8Array;
  readonly truncated: boolean;
}

export type HttpFailure = PortFailure<'connection' | 'timeout' | 'aborted'>;

export interface HttpClient {
  request(request: HttpRequest): Promise<HttpResponse | HttpFailure>;
}
