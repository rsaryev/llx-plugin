/**
 * A `serverCommand` entry against a server (managed-mcp.md, "How `serverCommand` entries match"):
 * "Every argument, in order", so `["npx", "-y", "server"]` matches neither `["npx", "server"]` nor
 * `["npx", "-y", "server", "--flag"]`. The `env` block is not compared: the caller passes the command
 * and arguments only. Both sides are `${VAR}`-expanded before they are compared ("Environment
 * variables in `serverCommand` and `serverUrl` entries"); `expandEntry` is the entry side, and the
 * server's command arrives expanded from the live environment.
 */
export function commandMatches(
  entry: readonly string[],
  server: readonly string[],
  expandEntry: (text: string) => string,
): boolean {
  const wanted = entry.map(expandEntry);
  return wanted.length === server.length && wanted.every((part, index) => part === server[index]);
}
