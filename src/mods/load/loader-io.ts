import type { PluginFiles } from '../../ports/index.ts';
import type { ModRuntime } from '../ports.ts';
import type { CompileResult } from './compile-output.ts';
import { thrownByCompiler, thrownByEngine } from './engine-faults.ts';
import type { LoaderEnv } from './loader.ts';

/** The reads and calls of the loader that reach a port: a file, the host's compiler, the host's runtime. */

export async function readJson(
  files: PluginFiles,
  path: string,
  signal: AbortSignal,
): Promise<unknown> {
  const text = await files.readText(path, signal);
  if (text === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return undefined;
  }
}

/** The compiler's outputs; a compiler that throws is an issue, not a throw out of the loader. */
export async function compileModule(
  env: LoaderEnv,
  files: PluginFiles,
  entry: string,
): Promise<CompileResult> {
  try {
    return await env.compiler.compile({ files, entry }, env.signal);
  } catch (thrown) {
    return { issues: [thrownByCompiler(entry, thrown)] };
  }
}

/** The runtime's answer; a runtime that throws (it ran out of stack, or the module's top-level code threw) is an issue, not a throw. */
export async function evaluate(
  env: LoaderEnv,
  input: Parameters<ModRuntime['load']>[0],
): ReturnType<ModRuntime['load']> {
  try {
    return await env.runtime.load(input, env.signal);
  } catch (thrown) {
    return { issues: [thrownByEngine(input.entry, thrown)] };
  }
}
