/**
 * The kit's ports for a local machine: the plugin's files on disk, commands through `bash`, HTTP
 * through `fetch`, the process environment, and the model through the AI SDK. A cloud host writes
 * the same interfaces over its sandbox instead; the kit cannot tell the difference.
 */
import { mkdir, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import type {
  CommandRun,
  CommandRunner,
  DirectoryEntry,
  Environment,
  HttpClient,
  Locations,
  ModelRunner,
  PluginFiles,
} from '@rsaryev/llx-plugin';
import { generateText, type LanguageModel } from 'ai';

const inside = (root: string, path: string) => path === root || path.startsWith(root + sep);

/** Read access to one plugin folder; a path that leaves it (`..`, a symlink out) reads as absent. */
export function diskFiles(rootDir: string): PluginFiles {
  const root = resolve(rootDir);
  const real = async (path: string): Promise<string | undefined> => {
    try {
      const target = await realpath(resolve(root, path));
      return inside(await realpath(root), target) ? target : undefined;
    } catch {
      return undefined;
    }
  };
  const readBytes = async (path: string) => {
    const target = await real(path);
    return target === undefined
      ? undefined
      : new Uint8Array(await readFile(target).catch(() => []));
  };
  return {
    readBytes,
    readText: async (path) => {
      const target = await real(path);
      return target === undefined ? undefined : readFile(target, 'utf8').catch(() => undefined);
    },
    list: async (path) => {
      const target = await real(path);
      if (target === undefined) return undefined;
      const entries = await readdir(target, { withFileTypes: true }).catch(() => undefined);
      if (entries === undefined) return undefined;
      const listed: DirectoryEntry[] = await Promise.all(
        entries.map(async (entry) => {
          const found = await stat(join(target, entry.name)).catch(() => undefined);
          return {
            name: entry.name,
            isFile: !!found?.isFile(),
            isDirectory: !!found?.isDirectory(),
          };
        }),
      );
      return listed.toSorted((a, b) => a.name.localeCompare(b.name));
    },
    stat: async (path) => {
      const target = await real(path);
      const found = target === undefined ? undefined : await stat(target).catch(() => undefined);
      if (target === undefined || found === undefined) return undefined;
      const symlink = target !== resolve(root, path);
      return {
        isFile: found.isFile(),
        isDirectory: found.isDirectory(),
        isSymlink: symlink,
        size: found.size,
        ...(symlink
          ? {
              realPath: relative(await realpath(root), target)
                .split(sep)
                .join('/'),
            }
          : {}),
      };
    },
    exists: async (path) => (await real(path)) !== undefined,
  };
}

/** Runs a command form the kit planned: `exec` with arguments, or a `shell` line through bash. */
export const localRunner: CommandRunner = {
  async run(run: CommandRun) {
    const argv =
      run.spec.form === 'exec'
        ? [run.spec.command, ...run.spec.args]
        : ['bash', '-c', run.spec.command];
    try {
      const child = Bun.spawn(argv, {
        cwd: run.cwd,
        env: { ...run.env },
        stdin: run.stdin === undefined ? 'ignore' : new TextEncoder().encode(run.stdin),
        stdout: 'pipe',
        stderr: 'pipe',
        ...(run.timeoutMs === undefined ? {} : { timeout: run.timeoutMs }),
        signal: run.signal,
      });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      const timedOut = child.signalCode !== null && run.timeoutMs !== undefined;
      const merged = run.mergeStderr === true;
      return {
        exitCode: child.signalCode === null ? exitCode : null,
        stdout: merged ? stdout + stderr : stdout,
        stderr: merged ? '' : stderr,
        timedOut,
      };
    } catch (cause) {
      return { exitCode: null, stdout: '', stderr: '', timedOut: false, startError: String(cause) };
    }
  },
};

export const fetchHttp: HttpClient = {
  async request(request) {
    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        ...(request.body === undefined ? {} : { body: request.body }),
        redirect: request.redirect ?? 'follow',
        signal: request.signal,
      });
      const body = await response.text();
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body,
        truncated: false,
      };
    } catch (cause) {
      return { failure: 'connection', message: String(cause) };
    }
  },
};

export function processEnvironment(extra: Record<string, string> = {}): Environment {
  const all = (): Record<string, string> => {
    const copy: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) copy[key] = value;
    }
    return { ...copy, ...extra };
  };
  return { get: (name) => all()[name], snapshot: all };
}

/** Where each plugin lives and keeps its data, and the project the agent works in. */
export function localLocations(
  projectDir: string,
  roots: ReadonlyMap<string, string>,
  dataDir: string,
): Locations {
  return {
    homeDir: () => homedir(),
    projectDir: () => projectDir,
    pluginRoot: (id) => roots.get(id) ?? join(dataDir, 'missing', id),
    pluginData: async (id) => {
      const dir = join(dataDir, id);
      await mkdir(dir, { recursive: true });
      return dir;
    },
    joinPath: (base, path) => join(base, path),
    existingDirectory: async (candidates) => {
      for (const candidate of candidates) {
        if ((await stat(candidate).catch(() => undefined))?.isDirectory()) return candidate;
      }
      return undefined;
    },
  };
}

/** `prompt` and `agent` hooks ask the same model the agent runs on. */
export function aiSdkModels(model: LanguageModel): ModelRunner {
  const ask = async (prompt: string, signal: AbortSignal) => {
    try {
      const { text } = await generateText({ model, prompt, abortSignal: signal });
      return { text };
    } catch (cause) {
      return { failure: 'model', message: String(cause) };
    }
  };
  return {
    evaluate: (request) => ask(request.prompt, request.signal),
    runAgent: (request) => ask(request.prompt, request.signal),
  };
}
