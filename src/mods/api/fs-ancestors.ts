import { z } from 'zod';
import { call, parse, type Deps } from './call.ts';
import { absolutePath, workingDirectory } from './paths.ts';
import type { FsAncestor, FsAncestorsRequest } from './ports.ts';

/**
 * `$.fs.ancestors({ names, of?, below? })` (claude-code/index.d.ts:3530, `FsAncestorsRequest`):
 * relative `.md` names, no `..`; the event carries the request as given (:7589).
 */
const name = z
  .string()
  .regex(/\.md$/, 'a relative .md file name')
  .refine((one) => !/^(?:[\\/]|[A-Za-z]:)/.test(one) && !one.split(/[\\/]/).includes('..'), {
    message: 'a relative .md file name, no ..',
  });
const request = z.looseObject({
  names: z.array(name),
  of: z.string().optional(),
  below: z.string().optional(),
});

/** The directory a path stands in. */
const directoryOf = (path: string): string => path.replace(/[\\/][^\\/]*$/, '') || path;

/** Whether `dir` is strictly inside `root`. */
const isInside = (dir: string, root: string): boolean =>
  dir.length > root.length && dir.startsWith(root) && /[\\/]/.test(dir.charAt(root.length));

/**
 * The kit's walk when the host has no `instructions` port (judgment, D8): from the root down to the
 * directory of `of` (else the working directory), only directories strictly inside `below` when it
 * is given, each named file that reads as it stands, its `@include`s not followed.
 */
async function walk(deps: Deps, asked: FsAncestorsRequest): Promise<FsAncestor[]> {
  const { fs, locations } = deps.ports;
  const start = asked.of === undefined ? await workingDirectory(deps) : directoryOf(asked.of);
  const above = await fs.ancestors(start, deps.signal);
  const dirs = [start, ...above]
    .toReversed()
    .filter((dir) => asked.below === undefined || isInside(dir, asked.below));
  const found: FsAncestor[] = [];
  for (const dir of dirs) {
    for (const one of asked.names) {
      const path = locations.joinPath(dir, one);
      const file = await fs.read(path, deps.signal);
      if (file !== undefined) {
        found.push({ dir, name: one, content: file.text, parts: [{ path, content: file.text }] });
      }
    }
  }
  return found;
}

/** The request with `of` and `below` absolute, as the walk takes them. */
async function absolute(deps: Deps, given: z.infer<typeof request>): Promise<FsAncestorsRequest> {
  return {
    names: given.names,
    ...(given.of === undefined ? {} : { of: await absolutePath(deps, given.of) }),
    ...(given.below === undefined ? {} : { below: await absolutePath(deps, given.below) }),
  };
}

export const ancestors = async (deps: Deps, args: readonly unknown[]): Promise<unknown> =>
  call(deps, 'fs.ancestors', parse('$.fs.ancestors', request, args[0]), async (e) => {
    const asked = await absolute(deps, parse('$.fs.ancestors', request, e));
    const { fs } = deps.ports;
    return fs.instructions ? fs.instructions(asked, deps.signal) : walk(deps, asked);
  });
