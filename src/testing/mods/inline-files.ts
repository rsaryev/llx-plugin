import type { DirectoryEntry, FileStat, PluginFiles } from '../../ports/index.ts';
import type { ModCompiler, ModRuntime } from '../../mods/ports.ts';
import type { RegisterFunction } from './inline-runtime.ts';
import { inlineRuntime } from './inline-runtime.ts';

/**
 * A mod written inline in a test (`{ name, register }`, test.md, "Test a policy mod") is a plugin
 * folder in memory: a manifest, a `hooks.json` and a module holding the text of `register`, so the
 * kit's scan reads it as it reads any mod, and the runtime runs the function itself.
 */

/** The text of `register` as a hooks module that exports it: a function declaration is renamed, anything else is assigned. */
export function moduleText(register: RegisterFunction): string {
  const text = register.toString();
  const declared = /^(async\s+)?function\s*\*?\s*[\w$]*/;
  return declared.test(text)
    ? `export ${text.replace(declared, (head) => head.replace(/[\w$]*$/, 'register'))}`
    : `export const register = ${text}`;
}

const encoder = new TextEncoder();

function memoryFolder(files: Readonly<Record<string, string>>): PluginFiles {
  const stat = (path: string): FileStat | undefined => {
    const text = files[path];
    return text === undefined
      ? undefined
      : { isFile: true, isDirectory: false, isSymlink: false, size: text.length };
  };
  const children = (path: string): readonly DirectoryEntry[] | undefined => {
    const prefix = path === '.' ? '' : `${path}/`;
    const names = new Map<string, boolean>();
    for (const file of Object.keys(files)) {
      if (!file.startsWith(prefix)) continue;
      const [name = '', ...rest] = file.slice(prefix.length).split('/');
      names.set(name, rest.length > 0);
    }
    return names.size === 0
      ? undefined
      : [...names]
          .toSorted(([a], [b]) => a.localeCompare(b))
          .map(([name, isDirectory]) => ({ name, isFile: !isDirectory, isDirectory }));
  };
  return {
    readText: (path) => Promise.resolve(files[path]),
    readBytes: (path) =>
      Promise.resolve(files[path] === undefined ? undefined : encoder.encode(files[path])),
    list: (path) => Promise.resolve(children(path)),
    stat: (path) => Promise.resolve(stat(path)),
    exists: (path) => Promise.resolve(files[path] !== undefined || children(path) !== undefined),
  };
}

export interface InlineMod {
  readonly name: string;
  readonly register: RegisterFunction;
  /** Where it runs; `user` when absent (test.md: "To load one somewhere other than `user`, add `tier` to it"). */
  readonly tier?: 'prepend' | 'append' | 'builtin';
}

/** The folder of an inline mod. */
export const inlineFolder = (mod: InlineMod): PluginFiles =>
  memoryFolder({
    '.claude-plugin/plugin.json': JSON.stringify({ name: mod.name }),
    'hooks/hooks.json': JSON.stringify({ modules: ['./register.js'] }),
    'hooks/register.js': moduleText(mod.register),
  });

/** `compiler`, except for the folders of inline mods, whose module is already JavaScript. */
export function withInlineCompiler(
  compiler: ModCompiler,
  inline: ReadonlySet<PluginFiles>,
): ModCompiler {
  return {
    compile: async (input, signal) => {
      if (!inline.has(input.files)) return compiler.compile(input, signal);
      const code = await input.files.readText(input.entry);
      return code === undefined ? { issues: [] } : { code, issues: [] };
    },
  };
}

/** `runtime`, except that an inline mod's `register` runs in this process. */
export function withInlineRuntime(
  runtime: ModRuntime,
  registers: ReadonlyMap<string, RegisterFunction>,
): ModRuntime {
  return {
    load: (input, signal) => {
      const register = registers.get(input.plugin);
      return register ? inlineRuntime(register).load(input, signal) : runtime.load(input, signal);
    },
  };
}
