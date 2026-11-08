import { readManifest, type PluginManifest } from '../../src/index.ts';

/** A manifest as Claude Code would load it: a test never builds one the reader would reject. */
export function manifestOf(raw: unknown): PluginManifest {
  const { manifest, issues } = readManifest(raw);
  if (!manifest) throw new Error(`the manifest does not load: ${JSON.stringify(issues)}`);
  return manifest;
}

export const json = (value: unknown): string => JSON.stringify(value);

/** The names of discovered or loaded files, in order. */
export const namesOf = (files: readonly { readonly name: string }[]): string[] =>
  files.map((file) => file.name);

/** The paths of discovered or loaded files, in order. */
export const pathsOf = (
  files: readonly { readonly path: string | undefined }[],
): (string | undefined)[] => files.map((file) => file.path);

/** The messages of a list of issues. */
export const messagesOf = (issues: readonly { readonly message: string }[]): string[] =>
  issues.map((found) => found.message);

/** A hooks file with one `PostToolUse` command hook, as in components.md, "Hooks". */
export const hooksFile = (command: string, event = 'PostToolUse'): string =>
  json({ hooks: { [event]: [{ matcher: 'Write|Edit', hooks: [{ type: 'command', command }] }] } });
