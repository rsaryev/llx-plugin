/**
 * DOC3: the export tables of `docs/api/` against the public surface (`scripts/lib/public-exports.ts`).
 * Each entry of package.json `exports` has one file, `docs/api/<slug>.md` (`root` for `.`, the
 * subpath's `/` written `-`), whose table has one row per name the entry exports, with its kind and
 * a non-empty line; and every name a doc imports from a kit entry in a code block exists there.
 */
import { join } from 'node:path';
import { exportsOf, publicEntries, type PublicEntry } from '../lib/public-exports.ts';
import { ROOT } from './location.ts';

const PACKAGE = '@rsaryev/llx-plugin';
const ROW = /^\| `([^`]+)` \| (\w+) \| (.*) \|$/;
const IMPORT = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'(@rsaryev\/llx-plugin(?:\/[\w/-]+)?)'/g;

/** The table file of an entry, relative to the repository. */
const tableFile = (subpath: string): string =>
  `docs/api/${subpath === '.' ? 'root' : subpath.slice(2).replace(/\//g, '-')}.md`;

async function tableProblems(entry: PublicEntry, problems: string[]): Promise<void> {
  const file = tableFile(entry.subpath);
  const handle = Bun.file(join(ROOT, file));
  if (!(await handle.exists())) {
    problems.push(`DOC3 ${entry.subpath} has no export table ${file}`);
    return;
  }
  const rows = new Map<string, { readonly kind: string; readonly line: string }>();
  for (const text of (await handle.text()).split('\n')) {
    const row = ROW.exec(text);
    if (row === null) continue;
    const [, name = '', kind = '', line = ''] = row;
    if (rows.has(name)) problems.push(`DOC3 ${file}: \`${name}\` has two rows`);
    rows.set(name, { kind, line: line.trim() });
  }
  const exported = exportsOf(entry);
  for (const { name, kind } of exported) {
    const row = rows.get(name);
    if (row === undefined) problems.push(`DOC3 ${file}: \`${name}\` is exported but has no row`);
    else if (row.kind !== kind)
      problems.push(`DOC3 ${file}: \`${name}\` is a ${kind}, not a ${row.kind}`);
    else if (row.line === '') problems.push(`DOC3 ${file}: \`${name}\` has no description`);
  }
  const names = new Set(exported.map((x) => x.name));
  for (const name of rows.keys()) {
    if (!names.has(name))
      problems.push(`DOC3 ${file}: \`${name}\` is not exported by ${entry.subpath}`);
  }
}

/** The DOC3 problems of the export tables and of the kit imports in the docs' code. */
export async function exportTableProblems(docs: readonly string[]): Promise<string[]> {
  const problems: string[] = [];
  const entries = publicEntries();
  const tables = new Set(entries.map((entry) => tableFile(entry.subpath)));
  for (const entry of entries) await tableProblems(entry, problems);
  for (const doc of docs) {
    if (doc.startsWith('docs/api/') && !tables.has(doc))
      problems.push(`DOC3 ${doc} is not the table of any entry`);
  }
  const surface = new Map(
    entries.map((entry) => [
      entry.subpath === '.' ? PACKAGE : `${PACKAGE}/${entry.subpath.slice(2)}`,
      new Set(exportsOf(entry).map((x) => x.name)),
    ]),
  );
  for (const doc of docs) {
    const text = await Bun.file(join(ROOT, doc)).text();
    for (const [, list = '', from = ''] of text.matchAll(IMPORT)) {
      const names = surface.get(from);
      if (names === undefined) {
        problems.push(`DOC3 ${doc}: imports from ${from}, which is not an entry`);
        continue;
      }
      for (const part of list.split(',')) {
        const name =
          part
            .trim()
            .replace(/^type\s+/, '')
            .split(/\s+as\s+/)[0] ?? '';
        if (name !== '' && !names.has(name))
          problems.push(`DOC3 ${doc}: ${from} exports no \`${name}\``);
      }
    }
  }
  return problems;
}
