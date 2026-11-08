/**
 * What a `headersHelper` prints (mcp.md, "Use dynamic headers for custom authentication": "a JSON
 * object of string key-value pairs to stdout"; plugins/host-marketplace.md, "Write the headersHelper
 * command"): the one reader for an MCP server's helper and a marketplace's. Judgment
 * (spec/judgments.md): the whole of stdout is parsed, and one value that is not a string refuses
 * the output, since the docs name no partial reading.
 */
export type HelperHeadersRead =
  | { readonly headers: Record<string, string> }
  | { readonly problem: 'not-an-object' | 'non-string-value' };

export function readHelperHeaders(stdout: string): HelperHeadersRead {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { problem: 'not-an-object' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { problem: 'not-an-object' };
  }
  const entries = Object.entries(parsed);
  const strings = entries.filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  return strings.length === entries.length
    ? { headers: Object.fromEntries(strings) }
    : { problem: 'non-string-value' };
}
