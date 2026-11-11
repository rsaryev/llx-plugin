import { z } from 'zod';
import { MOD_LIMITS } from '../../protocol/mods-limits.ts';
import type { ModsNamespaceApi } from '../types.ts';
import { call, parse, type Deps } from './call.ts';
import { absolutePath, workingDirectory } from './paths.ts';
import { ancestors } from './fs-ancestors.ts';
import type { FsEntry, FsStat } from './ports.ts';
import { utf8Length } from '../../format/utf8.ts';

const pathEvent = z.looseObject({ path: z.string() });
/** `$.fs.read(path, { as? })` (claude-code/index.d.ts:3446): `text`, the default, or `bytes` as `{ base64 }`; its event pins `as` (:7555). */
const readOptions = z.looseObject({ as: z.enum(['text', 'bytes']).default('text') });
const readEvent = z.looseObject({ path: z.string(), as: z.enum(['text', 'bytes']) });
/** `$.fs.stat(path, { resolve? })` (:3525): `resolve` false when left out, as its event pins it (:7582). */
const statOptions = z.looseObject({ resolve: z.boolean().default(false) });
const statEvent = z.looseObject({ path: z.string(), resolve: z.boolean() });
const writeEvent = z.looseObject({ path: z.string(), text: z.string() });

/**
 * One entry as the declarations name it (claude-code/index.d.ts:5227): `{ name, kind, size, mtimeMs,
 * isLink }`, `mtimeMs` 0 where the host gives none, and nothing else the host may have put on it.
 */
const entryOf = (entry: FsEntry): FsEntry => ({
  name: entry.name,
  kind: entry.kind,
  size: entry.size,
  mtimeMs: entry.mtimeMs ?? 0,
  isLink: entry.isLink,
});

/** What `stat` resolves to (:5299): the entry's fields without its name, `realPath` only when asked for. */
const statOf = (stat: FsStat, resolve: boolean): FsStat => ({
  kind: stat.kind,
  size: stat.size,
  mtimeMs: stat.mtimeMs ?? 0,
  isLink: stat.isLink,
  ...(resolve && stat.realPath !== undefined ? { realPath: stat.realPath } : {}),
});

const overLimit = (path: string, bytes: number): string =>
  `${path}: ${bytes} bytes is over the ${MOD_LIMITS.fileBytes}-byte limit`;

async function read(deps: Deps, e: unknown): Promise<string | { base64: string }> {
  const { path, as } = parse('$.fs.read', readEvent, e);
  const file = await deps.ports.fs.read(path, deps.signal, as);
  if (file === undefined) throw new Error(`${path}: no such file`);
  if (file.bytes > MOD_LIMITS.fileBytes) throw new Error(overLimit(path, file.bytes));
  if (as === 'text') return file.text;
  if (file.base64 === undefined) throw new Error(`${path}: the host read no bytes`);
  return { base64: file.base64 };
}

/** A missing path rejects `ENOENT` (claude-code/index.d.ts:3487). */
async function stat(deps: Deps, e: unknown): Promise<FsStat> {
  const { path, resolve } = parse('$.fs.stat', statEvent, e);
  const found = await deps.ports.fs.stat(path, deps.signal, { resolve });
  if (found === undefined) throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
  return statOf(found, resolve);
}

async function write(deps: Deps, e: unknown): Promise<undefined> {
  const { path, text } = parse('$.fs.write', writeEvent, e);
  const bytes = utf8Length(text);
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
    read: async (...args) => {
      const { as } = parse('$.fs.read', readOptions, args[1] ?? {});
      return call(deps, 'fs.read', { ...(await at('$.fs.read', args[0])), as }, (e) =>
        read(deps, e),
      );
    },
    write: async (...args) => {
      const text = parse('$.fs.write', z.string(), args[1]);
      return call(deps, 'fs.write', { ...(await at('$.fs.write', args[0])), text }, (e) =>
        write(deps, e),
      );
    },
    // `list(path?)`: "absent, the working directory" (:3467).
    list: async (...args) =>
      call(
        deps,
        'fs.list',
        args[0] === undefined
          ? { path: await workingDirectory(deps) }
          : await at('$.fs.list', args[0]),
        (e) => list(deps, e),
      ),
    exists: async (...args) =>
      call(deps, 'fs.exists', await at('$.fs.exists', args[0]), (e) =>
        fs.exists(parse('$.fs.exists', pathEvent, e).path, deps.signal),
      ),
    stat: async (...args) => {
      const { resolve } = parse('$.fs.stat', statOptions, args[1] ?? {});
      return call(deps, 'fs.stat', { ...(await at('$.fs.stat', args[0])), resolve }, (e) =>
        stat(deps, e),
      );
    },
    ancestors: async (...args) => ancestors(deps, args),
  };
}
