/**
 * The spec gate (docs/SPEC.md), offline and deterministic:
 *
 * - SP1 `spec/requirements.json` parses, and its ids are unique and sorted.
 * - SP2 every id a test names in `spec(...)` is a requirement.
 * - SP3 the installed `@anthropic-ai/claude-agent-sdk` describes the same Claude Code release as
 *   the requirements (SDK `0.3.N` ↔ Claude Code `2.1.N`): the types and the docs never disagree.
 * - SP4 docs pulled locally that are newer than the requirements must be extracted first.
 * - SP6 `spec/out-of-scope.json` names a known reason for every section it leaves out, and
 *   docs/SPEC.md explains each reason.
 * - SP7 when the docs are pulled, every page is audited section by section or listed, with a
 *   known reason, in `spec/out-of-scope-pages.json` (docs/SPEC.md, "Pages and scope").
 * - SP5 when the docs are pulled, the committed tables the tests read (`spec/docs-tables.json`,
 *   `tests/support/tool-table.ts`) are what the pulled pages say: tests never read the docs.
 * - SP8 the mods declarations snapshot (`spec/mods-declarations.json`) names the release of the
 *   requirements, and when the declarations are pulled (`bun run types:pull`) they are that
 *   release's and the snapshot is what they declare (AGENTS.md, E2a).
 */
import { join, relative } from 'node:path';
import { z } from 'zod';
import { DOCS_DIR, ROOT } from '../docs/location.ts';
import { declarationProblems } from './declarations/gate.ts';
import { pulledDocsTables, readCommittedDocsTables } from './mods-reference.ts';
import { OUT_OF_SCOPE_FILE, readRequirements } from './requirements.ts';
import { docsPages, pageProblems, readOutOfScopePages } from './page-scope.ts';
import { REASONS } from './scope.ts';
import { SCOPES } from './scopes.ts';
import { toolTableDrift } from './tool-table.ts';
import { testIds } from './test-ids.ts';

const problems: string[] = [];
const file = await readRequirements().catch((error: unknown) => {
  problems.push(`SP1 spec/requirements.json: ${String(error)}`);
  return undefined;
});
const ids = file?.requirements.map((r) => r.id) ?? [];
const known = new Set(ids);
if (known.size !== ids.length) problems.push('SP1 spec/requirements.json has duplicate ids');
if (ids.some((id, index) => index > 0 && (ids[index - 1] ?? '').localeCompare(id) > 0)) {
  problems.push('SP1 spec/requirements.json is not sorted: run `bun run spec:extract`');
}

for await (const path of new Bun.Glob('tests/**/*.ts').scan({ cwd: ROOT })) {
  const text = await Bun.file(join(ROOT, path)).text();
  for (const id of testIds(text)) {
    if (!known.has(id)) problems.push(`SP2 ${relative(ROOT, path)}: "${id}" is not a requirement`);
  }
}

const patch = (version: string): string => version.split('.').at(-1) ?? '';
const sdk = z
  .object({ version: z.string() })
  .parse(
    await Bun.file(join(ROOT, 'node_modules/@anthropic-ai/claude-agent-sdk/package.json')).json(),
  );
if (file && patch(sdk.version) !== patch(file.claudeCode)) {
  problems.push(
    `SP3 the Agent SDK ${sdk.version} and the requirements (Claude Code ${file.claudeCode}) ` +
      'describe different releases: update both together (docs/SPEC.md, "Updating")',
  );
}

const pulled = Bun.file(join(DOCS_DIR, 'VERSION'));
if (file && (await pulled.exists())) {
  const local = (await pulled.text()).trim();
  if (local !== file.claudeCode) {
    problems.push(`SP4 docs ${local} are pulled but the requirements are ${file.claudeCode}`);
  }
}

const pulledTables = await pulledDocsTables();
if (pulledTables) {
  const committed = await readCommittedDocsTables().catch(() => undefined);
  if (JSON.stringify(committed) !== JSON.stringify(pulledTables)) {
    problems.push(
      'SP5 spec/docs-tables.json differs from the pulled docs: run `bun run spec:extract`',
    );
  }
}
for (const drift of await toolTableDrift()) problems.push(`SP5 ${drift}`);

if (file) problems.push(...(await declarationProblems(file.claudeCode)));

const reasons = new Set<string>([...Object.keys(REASONS), 'container']);
const outOfScope = z
  .array(z.strictObject({ page: z.string(), section: z.string(), reason: z.string() }))
  .parse(await Bun.file(OUT_OF_SCOPE_FILE).json());
for (const entry of outOfScope) {
  if (!reasons.has(entry.reason)) {
    problems.push(`SP6 ${entry.page} § ${entry.section}: unknown reason "${entry.reason}"`);
  }
}
const specDoc = await Bun.file(join(ROOT, 'docs', 'SPEC.md')).text();
for (const reason of reasons) {
  if (!specDoc.includes(`| \`${reason}\` |`))
    problems.push(`SP6 docs/SPEC.md has no row for "${reason}"`);
}

const pagesPulled = await pulled.exists();
problems.push(
  ...pageProblems(
    pagesPulled ? await docsPages(DOCS_DIR) : undefined,
    new Set(SCOPES.map((scope) => scope.page)),
    await readOutOfScopePages().catch((error: unknown) => {
      problems.push(`SP7 spec/out-of-scope-pages.json: ${String(error)}`);
      return [];
    }),
    specDoc,
  ),
);

for (const problem of problems) console.error(problem);
process.exit(problems.length > 0 ? 1 : 0);
