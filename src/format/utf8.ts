/**
 * Sizes in UTF-8 bytes, for every limit the docs give in bytes: one byte count and one cut that
 * never splits a character.
 */
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** The UTF-8 bytes of `text`. */
export const utf8Length = (text: string): number => encoder.encode(text).length;

const startsCharacter = (byte: number | undefined): boolean => (byte ?? 0) >> 6 !== 0b10;

/** The longest prefix of `text` of at most `limit` UTF-8 bytes that ends between two characters. */
export function prefixWithinBytes(text: string, limit: number): string {
  const bytes = encoder.encode(text);
  if (bytes.length <= limit) return text;
  let end = limit;
  while (end > 0 && !startsCharacter(bytes[end])) end -= 1;
  return decoder.decode(bytes.subarray(0, end));
}
