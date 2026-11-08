/**
 * Extracts the requirements from the official docs in `.cache/claude-docs/` (`bun run docs:pull`)
 * into `spec/requirements.json`: one entry per documented event, field, source, tool or element,
 * with the page and section it comes from and no text of the docs (docs/SPEC.md). Prints what was
 * added and removed since the committed file, and fails when a rule finds nothing.
 *
 *   bun run spec:extract
 */
import { join } from 'node:path';
import { DOCS_DIR } from '../docs/location.ts';
import { keysOf, parsePage, type Page } from './markdown.ts';
import { readRequirements, REQUIREMENTS_FILE, type Requirement } from './requirements.ts';
import { HEADING_RULES, TABLE_RULES, type HeadingRule, type TableRule } from './sources.ts';

const pages = new Map<string, Page>();
async function page(path: string): Promise<Page> {
  const known = pages.get(path);
  if (known) return known;
  const file = Bun.file(join(DOCS_DIR, path));
  if (!(await file.exists())) throw new Error(`${path} is missing: run \`bun run docs:pull\``);
  const parsed = parsePage(await file.text());
  pages.set(path, parsed);
  return parsed;
}

function fromTables(rule: TableRule, source: Page): Requirement[] {
  return source.tables.flatMap((table) => {
    const section = rule.section.exec(table.heading.text);
    if (!section) return [];
    const header = table.header.map((cell) => cell.replace(/`/g, '')).join(' | ');
    if (rule.header && !rule.header.test(header)) return [];
    const prefix = rule.prefix(section);
    return table.rows
      .filter((row) => (rule.where ? rule.where(row) : true))
      .flatMap((row) => keysOf(row[0] ?? ''))
      .filter((key) => key.length > 0)
      .map((key) => ({
        id: `${prefix}.${key}`,
        category: rule.category,
        page: rule.page,
        section: table.heading.text,
      }));
  });
}

function fromHeadings(rule: HeadingRule, source: Page): Requirement[] {
  return source.headings
    .filter((heading) => heading.level === rule.level)
    .filter((heading) => heading.parents.some((parent) => rule.under.test(parent)))
    .map((heading) => ({
      id: `${rule.prefix}.${heading.text}`,
      category: rule.category,
      page: rule.page,
      section: heading.text,
    }));
}

const found = new Map<string, Requirement>();
const empty: string[] = [];
const rules: readonly (TableRule | HeadingRule)[] = [...TABLE_RULES, ...HEADING_RULES];
for (const rule of rules) {
  const source = await page(rule.page);
  const extracted = 'section' in rule ? fromTables(rule, source) : fromHeadings(rule, source);
  const label = 'section' in rule ? rule.section : rule.under;
  if (extracted.length === 0) empty.push(`${rule.page} ${label}`);
  for (const requirement of extracted) {
    if (!found.has(requirement.id)) found.set(requirement.id, requirement);
  }
}
if (empty.length > 0) {
  console.error(`These rules found nothing; the docs moved. Fix scripts/spec/sources.ts:`);
  for (const rule of empty) console.error(`  ${rule}`);
  process.exit(1);
}

const version = (await Bun.file(join(DOCS_DIR, 'VERSION')).text()).trim();
const requirements = [...found.values()].toSorted((a, b) => a.id.localeCompare(b.id));
const before = await readRequirements().catch(() => undefined);
const old = new Set(before?.requirements.map((r) => r.id) ?? []);
const now = new Set(requirements.map((r) => r.id));

await Bun.write(
  REQUIREMENTS_FILE,
  `${JSON.stringify({ claudeCode: version, requirements }, null, 2)}\n`,
);
const added = requirements.filter((r) => !old.has(r.id));
const removed = [...old].filter((id) => !now.has(id));
console.log(`Claude Code ${version}: ${requirements.length} requirements`);
console.log(`  added ${added.length}, removed ${removed.length}`);
for (const r of added.slice(0, 40)) console.log(`  + ${r.id}`);
for (const id of removed.slice(0, 40)) console.log(`  - ${id}`);
