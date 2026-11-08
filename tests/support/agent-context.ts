import type { SkillCatalog, McpPolicy } from '../../src/agents/context.ts';
import type { TextFileReader } from '../../src/ports/index.ts';

/** A skill catalog over fixed names; `hidden` skills set `disable-model-invocation: true`. */
export function catalog(names: readonly string[], hidden: readonly string[] = []): SkillCatalog {
  const known = new Set([...names, ...hidden]);
  const blocked = new Set(hidden);
  return { has: (name) => known.has(name), isModelInvocable: (name) => !blocked.has(name) };
}

/** An MCP policy that blocks the named servers: for every restriction, or for managed ones only. */
export function policy(
  blocked: { all?: readonly string[]; managed?: readonly string[] } = {},
): McpPolicy {
  const all = new Set([...(blocked.all ?? []), ...(blocked.managed ?? [])]);
  const managed = new Set(blocked.managed ?? []);
  return { allows: (name) => !all.has(name), managedAllows: (name) => !managed.has(name) };
}

/** A reader over fixed host paths; `reads` records every path asked for and its signal. */
export function reader(files: Readonly<Record<string, string>> = {}): TextFileReader & {
  readonly reads: { readonly path: string; readonly signal: AbortSignal | undefined }[];
} {
  const reads: { path: string; signal: AbortSignal | undefined }[] = [];
  return {
    reads,
    readText: (path, signal) => {
      reads.push({ path, signal });
      return Promise.resolve(files[path]);
    },
  };
}
