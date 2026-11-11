/** An in-memory `EnvFileStore` (hooks/env-file): files by session and kind, and a record of every clear. */
import type { EnvFileKind, EnvFileStore } from '../../src/hooks/env-file/index.ts';

/** The session the tests' files are of: the id of `SESSION` (tests/support/host.ts). */
export const ENV_SESSION = 'sess-1';

const pathOf = (kind: EnvFileKind, sessionId = ENV_SESSION): string =>
  `/session/${sessionId}/${kind}-env.sh`;

export function memoryEnvFiles(initial: Readonly<Record<string, string>> = {}): EnvFileStore & {
  /** What a hook of `sessionId` appends to: the path of `kind`. */
  readonly pathOf: (kind: EnvFileKind, sessionId?: string) => string;
  readonly texts: Map<string, string>;
  /** Each clear, as `<session>/<kind>`. */
  readonly cleared: string[];
} {
  const texts = new Map(Object.entries(initial));
  const cleared: string[] = [];
  return {
    pathOf,
    texts,
    cleared,
    path: (sessionId, kind) => Promise.resolve(pathOf(kind, sessionId)),
    read: (path) => Promise.resolve(texts.get(path)),
    clear: (sessionId, kind) => {
      cleared.push(`${sessionId}/${kind}`);
      texts.set(pathOf(kind, sessionId), '');
      return Promise.resolve();
    },
  };
}
