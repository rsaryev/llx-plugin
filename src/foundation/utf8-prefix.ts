const startsCharacter = (byte: number | undefined): boolean => (byte ?? 0) >> 6 !== 0b10;

/** The longest prefix of `text` of at most `limit` UTF-8 bytes that ends between two characters. */
export function prefixWithinBytes(text: string, limit: number): string {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= limit) return text;
  let end = limit;
  while (end > 0 && !startsCharacter(bytes[end])) end -= 1;
  return new TextDecoder().decode(bytes.subarray(0, end));
}
