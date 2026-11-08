const decoder = new TextDecoder();
const encoder = new TextEncoder();

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
  const bytes = encoder.encode(text);
  if (bytes.length <= limit) return { text, isTruncated: false };
  const cut = decoder.decode(bytes.subarray(0, limit));
  return { text: cut.endsWith('\uFFFD') ? cut.slice(0, -1) : cut, isTruncated: true };
}
