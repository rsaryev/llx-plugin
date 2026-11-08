import type { HttpFailedRun, HttpRun } from '../handlers/remote/types.ts';
import { failureVerdict, type Failure } from './on-failure.ts';
import type { Subject } from './subject.ts';
import { readBody } from './stdout-kind.ts';
import type { HandlerVerdict } from './types.ts';

/**
 * HTTP response handling (hooks.md, "HTTP response handling"). A hook answers with a status and a
 * body instead of an exit code and stdout, and never blocks by itself ("To block the action when
 * the request fails or returns a non-2xx status, set `onFailure: "block"`"):
 *
 * - 2xx with an empty body: success, "equivalent to exit code 0 with no output"
 * - 2xx with a JSON object body: parsed with the schema of command hooks; a body that fails
 *   validation is a non-blocking error
 * - 2xx with any other body: a non-blocking error, "handled the same as a non-2xx status"
 * - non-2xx status and connection failure: a non-blocking error
 * - timeout: the shared `timed-out` run
 */

const isSuccessStatus = (status: number): boolean => status >= 200 && status < 300;

const success = (subject: Subject, output?: object): HandlerVerdict => ({
  handler: subject.entry,
  status: 'success',
  succeeded: true,
  issues: [],
  ...(output === undefined ? {} : { output }),
  ...(subject.effectsIgnored ? { effectsIgnored: true } : {}),
});

const invalid = (text: string): Failure => ({ cause: 'invalid-output', text, detail: text });

function interpretBody(subject: Subject, body: string): HandlerVerdict {
  const reading = readBody(body);
  if (reading.empty) return success(subject);
  if (reading.json === undefined) {
    const text =
      `the response body is neither empty nor a JSON object: ${reading.notObject ?? ''}`.trim();
    return failureVerdict(subject, invalid(text));
  }
  const checked = subject.parse(subject.event, reading.json);
  return checked.output === undefined
    ? failureVerdict(subject, invalid(checked.failure ?? 'the response failed validation'))
    : success(subject, checked.output);
}

export function interpretHttp(subject: Subject, run: HttpRun): HandlerVerdict {
  if (isSuccessStatus(run.status)) return interpretBody(subject, run.body);
  const text = `HTTP ${run.status}`;
  return failureVerdict(subject, { cause: 'http-error', text, detail: text });
}

export function interpretHttpFailed(subject: Subject, run: HttpFailedRun): HandlerVerdict {
  return failureVerdict(subject, { cause: 'http-error', text: run.message, detail: run.message });
}
