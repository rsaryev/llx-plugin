import { z } from 'zod';
import { MOD_LIMITS } from '../../protocol/mods-limits.ts';
import type { ModsNamespaceApi } from '../types.ts';
import { call, parse, type Deps } from './call.ts';
import { absolutePath } from './paths.ts';
import type { FsEntry, FsStat } from './ports.ts';

const pathEvent = z.looseObject({ path: z.string() });
const writeEvent = z.looseObject({ path: z.string(), text: z.string() });
const encoder = new TextEncoder();

/** One entry as the docs name it: `{ name, kind, size, isLink }`, and nothing else the host may have put on it. */
const entryOf = (entry: FsEntry): FsEntry => ({
  name: entry.name,
  kind: entry.kind,
  size: entry.size,
  isLink: entry.isLink,
});

/** What `stat` resolves to: the entry's fields without its name, or `undefined` when there is no such path. */
const statOf = (stat: FsStat | undefined): FsStat | undefined =>
  stat && { kind: stat.kind, size: stat.size, isLink: stat.isLink };

const overLimit = (path: string, bytes: number): string =>
  `${path}: ${bytes} bytes is over the ${MOD_LIMITS.fileBytes}-byte limit`;

async function read(deps: Deps, e: unknown): Promise<string> {
  const { path } = parse('$.fs.read', pathEvent, e);
  const file = await deps.ports.fs.read(path, deps.signal);
  if (file === undefined) throw new Error(`${path}: no such file`);
  if (file.bytes > MOD_LIMITS.fileBytes) throw new Error(overLimit(path, file.bytes));
  return file.text;
}

async function write(deps: Deps, e: unknown): Promise<undefined> {
  const { path, text } = parse('$.fs.write', writeEvent, e);
  const bytes = encoder.encode(text).length;
  if (bytes > MOD_LIMITS.fileBytes) throw new Error(overLimit(path, bytes));
  await deps.ports.fs.write(path, text, deps.signal);
  return undefined;
}

async function list(deps: Deps, e: unknown): Promise<unknown> {
  const { path } = parse('$.fs.list', pathEvent, e);
  const entries = await deps.ports.fs.list(path, deps.signal);
  if (entries === undefined) throw new Error(`${path}: no such directory`);
  return entries.map(entryOf);
}

/** `$.fs`: the event's `path` arrives absolute (test.md, "Look up what a stub returns"). */
export function fsApi(deps: Deps): ModsNamespaceApi<'fs'> {
  const { fs } = deps.ports;
  const at = async (label: string, path: unknown): Promise<{ path: string }> => ({
    path: await absolutePath(deps, parse(label, z.string(), path)),
  });
  return {
    read: async (...args) =>
      call(deps, 'fs.read', await at('$.fs.read', args[0]), (e) => read(deps, e)),
    write: async (...args) => {
      const text = parse('$.fs.write', z.string(), args[1]);
      return call(deps, 'fs.write', { ...(await at('$.fs.write', args[0])), text }, (e) =>
        write(deps, e),
      );
    },
    list: async (...args) =>
      call(deps, 'fs.list', await at('$.fs.list', args[0]), (e) => list(deps, e)),
    exists: async (...args) =>
      call(deps, 'fs.exists', await at('$.fs.exists', args[0]), (e) =>
        fs.exists(parse('$.fs.exists', pathEvent, e).path, deps.signal),
      ),
    stat: async (...args) =>
      call(deps, 'fs.stat', await at('$.fs.stat', args[0]), async (e) =>
        statOf(await fs.stat(parse('$.fs.stat', pathEvent, e).path, deps.signal)),
      ),
    ancestors: async (...args) =>
      call(deps, 'fs.ancestors', await at('$.fs.ancestors', args[0]), (e) =>
        fs.ancestors(parse('$.fs.ancestors', pathEvent, e).path, deps.signal),
      ),
  };
}
