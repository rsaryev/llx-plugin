/**
 * Where the corpus lives: the official and community marketplaces cloned under `.cache/corpus/`, and
 * each plugin they list fetched beside them (never committed; docs/TESTING.md, "Corpus").
 */
import { join } from 'node:path';
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
  /** Absolute path of the plugin root, when it was fetched. */
  dir: z.string().optional(),
  planKind: z.string(),
  /** Why the plugin is not in the corpus: a refused plan, an unsupported kind or a failed fetch. */
  skipped: z.string().optional(),
});
export type CorpusPlugin = z.infer<typeof corpusPluginSchema>;
