/**
 * Where the corpus lives: the official and community marketplaces cloned under `.cache/corpus/`, and
 * each plugin they list fetched beside them (never committed; docs/TESTING.md, "Corpus").
 */
import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { z } from 'zod';
import { ROOT } from '../docs/location.ts';

export const CORPUS_DIR = join(ROOT, '.cache', 'corpus');
export const PLUGINS_DIR = join(CORPUS_DIR, 'plugins');
export const INDEX_FILE = join(CORPUS_DIR, 'index.json');
export const REPORT_FILE = join(CORPUS_DIR, 'report.json');

/** The marketplaces the corpus reads, cloned by `corpus:fetch`. */
export const MARKETPLACES = [
  {
    name: 'claude-plugins-official',
    repo: 'https://github.com/anthropics/claude-plugins-official.git',
  },
  {
    name: 'claude-plugins-community',
    repo: 'https://github.com/anthropics/claude-plugins-community.git',
  },
] as const;

/** One plugin of the corpus, as `corpus:fetch` left it. */
export const corpusPluginSchema = z.object({
  marketplace: z.string(),
  name: z.string(),
  /** The plugin root, relative to the corpus folder (so the checkout can move), when it was fetched. */
  dir: z.string().optional(),
  planKind: z.string(),
  /** Why the plugin is not in the corpus: a refused plan, an unsupported kind or a failed fetch. */
  skipped: z.string().optional(),
});
export type CorpusPlugin = z.infer<typeof corpusPluginSchema>;

/** One fetched plugin, with the absolute path of its root on this machine. */
export interface CorpusTarget {
  /** `marketplace/name`. */
  readonly key: string;
  readonly name: string;
  readonly dir: string;
}

/** What the index records for a plugin root: its path below the corpus folder. */
export const indexedDir = (dir: string): string => relative(CORPUS_DIR, dir);

/**
 * A root `corpus:fetch` saw on disk that is gone: a plugin it cloned, or one inside a marketplace
 * clone that is itself gone. (A marketplace may list a local path it does not have; that one is
 * compared as it is.)
 */
const isLost = (dir: string): boolean =>
  !existsSync(dir) &&
  (dir.startsWith(`${PLUGINS_DIR}/`) ||
    !MARKETPLACES.some(({ name }) => existsSync(join(CORPUS_DIR, name))));

/**
 * The fetched plugins of the index, in its order. A lost root fails the run: an oracle and a kit
 * that both say "no such directory" would otherwise agree on every plugin.
 */
export async function readCorpusTargets(): Promise<CorpusTarget[]> {
  const index = z.array(corpusPluginSchema).parse(await Bun.file(INDEX_FILE).json());
  const targets = index.flatMap((plugin) =>
    plugin.dir === undefined
      ? []
      : [
          {
            key: `${plugin.marketplace}/${plugin.name}`,
            name: plugin.name,
            dir: resolve(CORPUS_DIR, plugin.dir),
          },
        ],
  );
  const missing = targets.filter((target) => isLost(target.dir));
  if (missing.length > 0) {
    const first = missing[0]?.dir ?? '';
    throw new Error(
      `${missing.length} of ${targets.length} corpus plugins are not on disk (first: ${first}); run \`bun run corpus:fetch\``,
    );
  }
  return targets;
}
