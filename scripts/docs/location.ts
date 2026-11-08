import { join } from 'node:path';

/** The repository root. */
export const ROOT = join(import.meta.dir, '..', '..');

/** Where `bun run docs:pull` keeps the official docs (gitignored). */
export const DOCS_DIR = join(ROOT, '.cache', 'claude-docs');

/** The docs site's index of every page, and the prefix each page's URL starts with. */
export const DOCS_INDEX = 'https://code.claude.com/docs/llms.txt';
export const DOCS_PREFIX = 'https://code.claude.com/docs/en/';

/** A page's public address, for citations: `hooks.md` → its URL. */
export const pageUrl = (page: string): string => `${DOCS_PREFIX}${page}`;
