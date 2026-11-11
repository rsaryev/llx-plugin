/**
 * How Claude Code prepares `description` and `input_preview` before relaying a permission request
 * (channels-reference.md, "Permission request fields"). Pure text rules.
 *
 * Judgments (spec/judgments.md): each neutralized character becomes U+FFFD; the 3,500 code points are
 * split evenly, the start and the end 1,750 each, around the marker; an array of more than 10,000
 * items counts as "extremely large"; the credential patterns are the common provider prefixes.
 */

/** "Relays text whole up to 3,500 code points." */
const RELAY_LIMIT = 3500;
const HALF = RELAY_LIMIT / 2;
const REPLACEMENT = '\uFFFD';
const UNSERIALIZABLE = '(value unserializable)';
const MAX_ARRAY = 10_000;

/** Direction overrides and isolates, invisible characters, quote and angle-bracket lookalikes. */
const NEUTRALIZED = new RegExp(
  '[\\u061C\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\u00AD\\uFEFF' +
    '\\u2018-\\u201F\\u2039\\u203A\\u02BB\\u02BC\\uFF02\\uFF07\\u2329\\u232A\\u27E8\\u27E9' +
    '\\u3008\\u3009\\uFF1C\\uFF1E\\u2039\\u203A\\u00AB\\u00BB]',
  'gu',
);

/** Recognizable provider tokens: only letters, digits, `_` and `-`, so no mask covers shell, path or URL characters. */
const CREDENTIAL = new RegExp(
  '(?<![\\w\\-/\\\\.~])(?:sk-ant-[\\w-]{10,}|sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|' +
    'github_pat_\\w{20,}|AKIA[0-9A-Z]{16}|xox[abprs]-[\\w-]{10,}|glpat-[\\w-]{20,})(?![\\w\\-/\\\\]|\\.\\w)',
  'g',
);

/** `[REDACTED]` "in place of a recognizable provider credential token". */
export const maskCredentials = (text: string): string => text.replace(CREDENTIAL, '[REDACTED]');

/** "For a longer value, you receive its start and its end around a counted `⋯ N code points elided ⋯` marker." */
export function elide(text: string): string {
  const points = Array.from(text);
  if (points.length <= RELAY_LIMIT) return text;
  const cut = points.length - RELAY_LIMIT;
  return `${points.slice(0, HALF).join('')}⋯ ${cut} code points elided ⋯${points.slice(-HALF).join('')}`;
}

/** Mask, neutralize, fold each run of whitespace to one space, then elide. */
export const sanitizeRelayText = (text: string): string =>
  elide(maskCredentials(text).replace(NEUTRALIZED, REPLACEMENT).replace(/\s+/gu, ' '));

const serializable = (value: unknown): string | undefined => {
  if (Array.isArray(value) && value.length > MAX_ARRAY) return undefined;
  try {
    return JSON.stringify(value) ?? undefined;
  } catch {
    return undefined;
  }
};

const fieldText = (value: unknown): string => {
  if (typeof value === 'string') return JSON.stringify(sanitizeRelayText(value));
  const json = serializable(value);
  return json === undefined ? UNSERIALIZABLE : sanitizeRelayText(json);
};

/**
 * The `input_preview`: the arguments "as JSON-shaped display text, keyed per top-level field". The limit
 * applies to each field separately and a string keeps its own quotes; a field that cannot be
 * serialized shows `(value unserializable)` and keeps its key; key names are masked too.
 */
export function inputPreview(input: Readonly<Record<string, unknown>>): string {
  const fields = Object.entries(input).map(
    ([key, value]) => `${JSON.stringify(maskCredentials(key))}: ${fieldText(value)}`,
  );
  return `{${fields.join(', ')}}`;
}

/** "When the model gives no description, the field is the constant `Run shell command`." */
const NO_DESCRIPTION = 'Run shell command';
export const relayDescription = (description: string | undefined): string =>
  description === undefined || description.trim() === ''
    ? NO_DESCRIPTION
    : sanitizeRelayText(description);
