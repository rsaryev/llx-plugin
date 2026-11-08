/**
 * What a hook's stdout is (hooks.md, "Exit code 0"): "For a hook that isn't async, your stdout
 * counts as JSON output only when you print one JSON object, on one line or several, with nothing
 * around it but whitespace. Claude Code reads any other stdout as plain text or a parse failure."
 */

export interface StdoutReading {
  /** The stdout without the whitespace around it. */
  readonly text: string;
  /** One JSON object, to be checked against the output schema. */
  readonly json?: object;
  /** Why it is a parse failure: it looks like JSON and is not one object. Neither `json` nor this: plain text or nothing. */
  readonly parseFailure?: string;
}

type Parsed =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly message: string };

function tryParse(text: string): Parsed {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (thrown) {
    return { ok: false, message: thrown instanceof Error ? thrown.message : String(thrown) };
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const lines = (text: string): string[] => text.split(/\r?\n/).filter((line) => line.trim() !== '');

/** "A JSON output object that sets a field": judgment (spec/judgments.md), an object with a key. */
const setsAField = (parsed: Parsed): boolean =>
  parsed.ok && isRecord(parsed.value) && Object.keys(parsed.value).length > 0;

const SEVERAL_OBJECTS =
  'stdout holds several JSON values and one of them is a JSON output object; print that object with nothing else on stdout';

export function readStdout(stdout: string): StdoutReading {
  const text = stdout.trim();
  // "Output that doesn't start with `{`, or that starts with `{` and doesn't end with `}`: plain text.
  // A JSON array and a quoted JSON string are plain text by this rule."
  if (!text.startsWith('{') || !text.endsWith('}')) return { text };
  const whole = tryParse(text);
  if (whole.ok && isRecord(whole.value)) return { text, json: whole.value };
  const each = lines(text).map((line) => tryParse(line.trim()));
  // "Two or more lines that each parse as JSON on their own ...: plain text when no line is a JSON
  // output object that sets a field. When one line is, the output is a parse failure."
  if (each.length >= 2 && each.every((parsed) => parsed.ok)) {
    return each.some(setsAField) ? { text, parseFailure: SEVERAL_OBJECTS } : { text };
  }
  // "Anything else that starts with `{` and ends with `}` but isn't valid JSON: a parse failure."
  return { text, parseFailure: whole.ok ? SEVERAL_OBJECTS : whole.message };
}

/**
 * An `http` hook's body (hooks.md, "HTTP response handling"): "2xx with an empty body: success";
 * "2xx with a JSON object body: parsed using the same JSON output schema"; "2xx with any other body,
 * such as plain text: non-blocking error".
 */
export interface BodyReading {
  readonly empty: boolean;
  readonly json?: object;
  /** Text that is not a JSON object (plain text, an array, a quoted string, bad JSON). */
  readonly notObject?: string;
}

export function readBody(body: string): BodyReading {
  const text = body.trim();
  if (text === '') return { empty: true };
  const parsed = tryParse(text);
  if (parsed.ok && isRecord(parsed.value)) return { empty: false, json: parsed.value };
  return { empty: false, notObject: parsed.ok ? 'the body is not a JSON object' : parsed.message };
}

/**
 * An async hook's response (hooks.md, "How async hooks execute"): "Alone on stdout: when the
 * response is the only text on stdout, it can span several lines" or "On one line of its own: an
 * async hook can print other text to stdout when the response fits on one line by itself". Judgment
 * (spec/judgments.md): when several lines are objects, the last one is the response.
 */
export function readAsyncResponse(stdout: string): object | undefined {
  const alone = readStdout(stdout).json;
  if (alone !== undefined) return alone;
  const found = lines(stdout)
    .map((line) => tryParse(line.trim()))
    .flatMap((parsed) => (parsed.ok && isRecord(parsed.value) ? [parsed.value] : []));
  return found.at(-1);
}
