/**
 * The docs gate:
 *
 * - DOC1 a repository path a doc names in code ticks (`src/…`, `tests/…`, `scripts/…`, `docs/…`,
 *   `spec/…`, `config/…`) exists: docs never point at code that moved.
 * - DOC2 every `docs/*.md` has a row in AGENTS.md's docs table, and every row names a doc.
 */
import { join } from 'node:path';
import { ROOT } from './docs/location.ts';
import { finish, repositoryFiles } from './lib/files.ts';

const files = repositoryFiles();
const present = new Set(files);
const folders = new Set(
  files.flatMap((path) =>
    path
      .split('/')
      .slice(0, -1)
      .map((_, i, parts) => parts.slice(0, i + 1).join('/')),
  ),
);
const exists = (path: string): boolean =>
  present.has(path) || folders.has(path.replace(/\/$/, '')) || /[*<…]/.test(path);

const REPO_PATH = /`((?:src|tests|scripts|docs|spec|config)\/[^`\s]*)`/g;
const problems: string[] = [];
const docs = files.filter((path) => path.endsWith('.md') && !path.startsWith('.cache/'));
for (const doc of docs) {
  const text = await Bun.file(join(ROOT, doc)).text();
  for (const match of text.matchAll(REPO_PATH)) {
    const path = (match[1] ?? '').replace(/[.,;:)]+$/, '').replace(/#.*$/, '');
    if (!exists(path)) problems.push(`DOC1 ${doc}: \`${path}\` does not exist`);
  }
}

const agents = await Bun.file(join(ROOT, 'AGENTS.md')).text();
const listed = new Set([...agents.matchAll(/^\| `(docs\/[^`]+\.md)`/gm)].map((m) => m[1] ?? ''));
const written = files.filter((path) => /^docs\/[^/]+\.md$/.test(path));
for (const doc of written) {
  if (!listed.has(doc)) problems.push(`DOC2 ${doc} has no row in AGENTS.md`);
}
for (const doc of listed) {
  if (!present.has(doc)) problems.push(`DOC2 AGENTS.md lists ${doc}, which does not exist`);
}
finish('Docs DOC1–DOC2', problems, `${docs.length} docs`);
