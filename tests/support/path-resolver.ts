import type { PortFailure } from '../../src/ports/failure.ts';
import type { PathResolver } from '../../src/ports/path-resolver.ts';

/**
 * A `PathResolver` over a table of symlinks: a path (or a directory it goes through) that is a key
 * resolves to its value; the others resolve to themselves unless `missing` lists them (absent) or
 * `loops` does (a failure).
 */
export function fakeResolver(
  links: Readonly<Record<string, string>>,
  options: { readonly missing?: readonly string[]; readonly loops?: readonly string[] } = {},
): PathResolver & { readonly asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    realpath(path: string): Promise<string | PortFailure | undefined> {
      asked.push(path);
      if (options.loops?.includes(path) === true) {
        return Promise.resolve({ failure: 'loop', message: `symlinks of ${path} form a loop` });
      }
      if (options.missing?.includes(path) === true) return Promise.resolve(undefined);
      const through = Object.keys(links).find(
        (from) => path === from || path.startsWith(`${from}/`),
      );
      const linked =
        through === undefined ? path : `${links[through]}${path.slice(through.length)}`;
      return Promise.resolve(linked);
    },
  };
}
