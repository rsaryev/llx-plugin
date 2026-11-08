/** An in-memory `EnvFileStore` (hooks/env-file): files by kind, and a record of every clear. */
import type { EnvFileKind, EnvFileStore } from '../../src/hooks/env-file/index.ts';

const pathOf = (kind: EnvFileKind): string => `/session/${kind}-env.sh`;

export function memoryEnvFiles(initial: Readonly<Record<string, string>> = {}): EnvFileStore & {
  /** What a hook appends to: the path of `kind`. */
  readonly pathOf: (kind: EnvFileKind) => string;
  readonly texts: Map<string, string>;
  readonly cleared: EnvFileKind[];
} {
  const texts = new Map(Object.entries(initial));
  const cleared: EnvFileKind[] = [];
  return {
    pathOf,
    texts,
    cleared,
    path: (kind) => Promise.resolve(pathOf(kind)),
    read: (path) => Promise.resolve(texts.get(path)),
    clear: (kind) => {
      cleared.push(kind);
      texts.set(pathOf(kind), '');
      return Promise.resolve();
    },
  };
}
