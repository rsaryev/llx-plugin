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

/** Where `bun run types:pull` keeps the declarations Claude Code writes for mods (gitignored). */
export const TYPES_DIR = join(ROOT, '.cache', 'claude-types');

/** The declaration files Claude Code writes beside a mod, under `.claude-plugin/types/`. */
export const TYPES_FILES = [
  'claude-code/index.d.ts',
  'claude-code-tools/index.d.ts',
  'claude-code-mcp/index.d.ts',
  'tsconfig.json',
] as const;
