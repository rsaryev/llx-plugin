import type { PluginFiles } from '../ports/index.ts';

/** A JSON file's value, or the reason it cannot be used; `missing` when there was no text to parse. */
export type JsonRead =
  | { readonly value: unknown }
  | { readonly problem: string; readonly missing?: true };

/** The value of a JSON text, or the parser's reason it is not JSON; never a throw. */
export function parseJson(text: string): JsonRead {
  try {
    return { value: JSON.parse(text) };
  } catch (failure) {
    return { problem: failure instanceof Error ? failure.message : 'invalid JSON' };
  }
}

/** The message a file that is no JSON gives (plugins/troubleshooting.md; plugins/create-marketplace.md): `Invalid JSON syntax: <reason>`. */
export const invalidJsonSyntax = (problem: string): string => `Invalid JSON syntax: ${problem}`;

/** Reads and parses one file of the plugin; a missing file or invalid JSON is a `problem`, never a throw. */
export async function readJson(
  files: PluginFiles,
  path: string,
  signal?: AbortSignal,
): Promise<JsonRead> {
  const text = await files.readText(path, signal);
  return text === undefined
    ? { problem: 'the file could not be read', missing: true }
    : parseJson(text);
}
