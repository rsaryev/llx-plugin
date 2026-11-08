/**
 * The `terminalSequence` field (hooks.md, "Emit terminal notifications"): "Restricted to OSC
 * `0`/`1`/`2`/`9`/`99`/`777` and BEL. If the value contains anything outside the allowlist, the
 * field is ignored." The value is "a string of one or more allowlisted escape sequences"; "Sequences
 * may be terminated with BEL or with ST", and CSI sequences, OSC palette sequences, OSC 8
 * hyperlinks, OSC 52 clipboard writes and OSC 1337 are rejected.
 */

const ESC = '\u001b';
const BEL = '\u0007';
const ST = `${ESC}\\`;
const OSC_START = `${ESC}]`;
const ALLOWED_OSC: ReadonlySet<string> = new Set(['0', '1', '2', '9', '99', '777']);

/** A control character cannot sit in a sequence's text: it could end it early or start another. */
const isControl = (char: string): boolean => {
  const code = char.codePointAt(0) ?? 0;
  return code < 0x20 || (code >= 0x7f && code <= 0x9f);
};

/** The end of the terminator that follows `at`, or `undefined` when the text there is not one. */
function terminatorEnd(text: string, at: number): number | undefined {
  if (text.startsWith(BEL, at)) return at + BEL.length;
  return text.startsWith(ST, at) ? at + ST.length : undefined;
}

/** The end of the OSC sequence that starts at `at`, or `undefined` when it is not an allowed one. */
function oscEnd(text: string, at: number): number | undefined {
  let cursor = at + OSC_START.length;
  const numberStart = cursor;
  while (cursor < text.length && text[cursor] !== ';' && !isControl(text[cursor] ?? ''))
    cursor += 1;
  if (!ALLOWED_OSC.has(text.slice(numberStart, cursor))) return undefined;
  while (cursor < text.length) {
    const end = terminatorEnd(text, cursor);
    if (end !== undefined) return end;
    if (isControl(text[cursor] ?? '')) return undefined;
    cursor += 1;
  }
  return undefined;
}

/** The end of the allowlisted sequence at `at`: a bare BEL or an allowed OSC; else `undefined`. */
function sequenceEnd(text: string, at: number): number | undefined {
  if (text.startsWith(BEL, at)) return at + BEL.length;
  return text.startsWith(OSC_START, at) ? oscEnd(text, at) : undefined;
}

/** The value itself when every part is allowlisted, else `undefined`: the field is ignored. */
export function allowedTerminalSequence(value: string): string | undefined {
  if (value === '') return undefined;
  let cursor = 0;
  while (cursor < value.length) {
    const end = sequenceEnd(value, cursor);
    if (end === undefined) return undefined;
    cursor = end;
  }
  return value;
}
