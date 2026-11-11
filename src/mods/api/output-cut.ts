import { prefixWithinBytes } from '../../format/utf8.ts';

/**
 * The first `limit` bytes of `text`, in UTF-8 (reference.md, "Limits": 4 MiB of `stdout` and
 * `stderr`, 4 MiB of a `$.http.fetch` response body). A cut inside a character leaves the characters before it whole.
 */
export function cutOutput(
  text: string,
  limit: number,
): {
  readonly text: string;
  readonly isTruncated: boolean;
} {
  const cut = prefixWithinBytes(text, limit);
  return { text: cut, isTruncated: cut.length < text.length };
}
