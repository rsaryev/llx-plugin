import type { PluginFiles } from '../ports/index.ts';

/** A JSON file's value, or the reason it cannot be used. */
export type JsonRead = { readonly value: unknown } | { readonly problem: string };

/** Reads and parses one file of the plugin; a missing file or invalid JSON is a `problem`, never a throw. */
export async function readJson(
  files: PluginFiles,
  path: string,
  signal?: AbortSignal,
): Promise<JsonRead> {
  const text = await files.readText(path, signal);
  if (text === undefined) return { problem: 'the file could not be read' };
  try {
    return { value: JSON.parse(text) };
  } catch (failure) {
    return { problem: failure instanceof Error ? failure.message : 'invalid JSON' };
  }
}
