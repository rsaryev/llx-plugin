import { utf8Length } from '../format/utf8.ts';

/** The characters of `value` written as JSON, or `undefined` when it cannot be (a cycle, a bigint, nothing to write). */
export function jsonChars(value: unknown): number | undefined {
  try {
    return JSON.stringify(value)?.length;
  } catch {
    return undefined;
  }
}

/** The UTF-8 bytes of `value` written as JSON, or `undefined` when it cannot be. */
export function jsonBytes(value: unknown): number | undefined {
  try {
    const text = JSON.stringify(value);
    return text === undefined ? undefined : utf8Length(text);
  } catch {
    return undefined;
  }
}
