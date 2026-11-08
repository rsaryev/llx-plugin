/**
 * The spec gate (docs/SPEC.md), offline and deterministic:
 *
 * - SP1 `spec/requirements.json` parses, and its ids are unique and sorted.
 * - SP2 every id a test names in `spec(...)` is a requirement.
 * - SP3 the installed `@anthropic-ai/claude-agent-sdk` describes the same Claude Code release as
 *   the requirements (SDK `0.3.N` ↔ Claude Code `2.1.N`): the types and the docs never disagree.
 * - SP4 docs pulled locally that are newer than the requirements must be extracted first.
 * - SP5 when the docs are pulled, the committed tables the tests read (`spec/docs-tables.json`,
 *   `tests/support/tool-table.ts`) are what the pulled pages say: tests never read the docs.
 */
import { join, relative } from 'node:path';
import { z } from 'zod';
import { DOCS_DIR, ROOT } from '../docs/location.ts';
import { pulledDocsTables, readCommittedDocsTables } from './mods-reference.ts';
import { readRequirements } from './requirements.ts';
import { toolTableDrift } from './tool-table.ts';

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

const LITERAL = /['"]([^'"]+)['"]/g;
const CALL = /\bspec\(\s*(\[[^\]]*\]|'[^']*'|"[^"]*")/g;
for await (const path of new Bun.Glob('tests/**/*.ts').scan({ cwd: ROOT })) {
  const text = await Bun.file(join(ROOT, path)).text();
  for (const call of text.matchAll(CALL)) {
    for (const literal of (call[1] ?? '').matchAll(LITERAL)) {
      const id = literal[1] ?? '';
      if (!known.has(id))
        problems.push(`SP2 ${relative(ROOT, path)}: "${id}" is not a requirement`);
    }
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

for (const problem of problems) console.error(problem);
process.exit(problems.length > 0 ? 1 : 0);
