import type { PortFailure } from './failure.ts';

/** One HTTP request. Header names are lower case in both directions. */
export interface HttpRequest {
  readonly method: 'GET' | 'POST';
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly timeoutMs?: number;
  /** Stop reading the body at this many bytes; the response says `truncated`. */
  readonly maxBytes?: number;
  /** `manual` returns a redirect as it is (status and `location`) so the kit can judge each hop. */
  readonly redirect?: 'follow' | 'manual';
  readonly signal: AbortSignal;
}

export interface HttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly truncated: boolean;
}

export type HttpFailure = PortFailure<'connection' | 'timeout' | 'aborted'>;

export interface HttpClient {
  request(request: HttpRequest): Promise<HttpResponse | HttpFailure>;
}
