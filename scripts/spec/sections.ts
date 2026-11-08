/**
 * Turns the prose of the audited pages into requirements and classifies every heading
 * (scripts/spec/scope.ts). Ids carry the heading's text and, for a section that lists rules, the
 * item's lead-in (a bold label or a code span) or its position: never a sentence of the docs.
 */
import { keysOf, type Heading, type Page } from './markdown.ts';
import type { Requirement } from './requirements.ts';
import { idPrefix, slugOf, type Matcher, type PageScope, type Reason } from './scope.ts';

/** Sections of at least this many top-level items (or table rows) give one requirement each. */
const MIN_ITEMS = 3;
/** A heading with sub-sections and no more own lines than this only groups them. */
const CONTAINER_LINES = 6;
const MAX_LEAD = 40;
/** A link's text or target is not an identifier. */
const LINK = /^\[|\]\(|#/;

export interface Excluded {
  readonly page: string;
  readonly section: string;
  readonly reason: Reason | 'container';
}

export interface Audit {
  readonly requirements: Requirement[];
  readonly excluded: Excluded[];
  /** Skip entries that matched nothing: the docs moved, so the extraction refuses them. */
  readonly stale: string[];
}

/** The identifier an item leads with: a short bold label, else a leading code span. */
function leadOf(text: string): string | undefined {
  const lead = /^\*\*([^*]+)\*\*/.exec(text)?.[1] ?? /^`([^`]+)`/.exec(text)?.[1];
  const clean = lead
    ?.replace(/`/g, '')
    .replace(/[:.\s]+$/, '')
    .trim();
  return clean && clean.length <= MAX_LEAD && !LINK.test(clean) ? clean : undefined;
}

/** The labelled items' identifiers, each once; an item without a label has none. */
function itemIds(texts: readonly string[]): string[] {
  const labels = texts.map((text) => leadOf(text));
  return [...new Set(labels.filter((label): label is string => label !== undefined))];
}

/**
 * A table row's identifiers: its code spans or short first-cell text; a sentence has none, unless
 * the section names its rows by phrase (`PageScope.phrases`).
 */
function rowIds(cells: readonly string[], phrases: boolean): string[] {
  const limit = phrases ? Number.POSITIVE_INFINITY : MAX_LEAD;
  return cells.flatMap((cell) =>
    keysOf(cell).filter((key) => key.length > 0 && key.length <= limit && !LINK.test(key)),
  );
}

const matches = (rule: Matcher, heading: Heading): boolean =>
  typeof rule === 'string'
    ? rule === heading.text
    : typeof rule === 'function'
      ? rule(heading)
      : rule.test(heading.text);

function isContainer(page: Page, heading: Heading): boolean {
  const at = page.headings.indexOf(heading);
  const next = page.headings[at + 1];
  const lines = page.bodyLines.get(heading) ?? 0;
  return next !== undefined && next.level > heading.level && lines <= CONTAINER_LINES;
}

function categoryOf(scope: PageScope, heading: Heading): PageScope['category'] {
  const route = scope.routes?.find(
    (candidate) =>
      (candidate.heading || candidate.parent) &&
      (candidate.heading ? candidate.heading.test(heading.text) : true) &&
      (candidate.parent ? heading.parents.some((p) => candidate.parent?.test(p)) : true),
  );
  return route?.category ?? scope.category;
}

function fromSection(scope: PageScope, page: Page, heading: Heading): Requirement[] {
  const category = categoryOf(scope, heading);
  const base = `${idPrefix(category)}.${slugOf(scope)}.${heading.text}`;
  const make = (id: string): Requirement => ({
    id,
    category,
    page: scope.page,
    section: heading.text,
  });
  const items = page.items.filter((item) => item.heading === heading).map((item) => item.text);
  const labelled = itemIds(items);
  const keys = scope.whole?.some((rule) => matches(rule, heading))
    ? []
    : [
        ...(labelled.length >= MIN_ITEMS ? labelled : []),
        ...page.tables
          .filter((table) => table.heading === heading && table.rows.length >= MIN_ITEMS)
          .flatMap((table) =>
            rowIds(
              table.rows.map((row) => row[0] ?? ''),
              scope.phrases?.some((rule) => matches(rule, heading)) ?? false,
            ),
          ),
      ];
  const whole = keys.length === 0 || items.length > labelled.length;
  return [...(whole ? [base] : []), ...keys.map((key) => `${base}.${key}`)].map(make);
}

/** Classifies every heading (level 2 to 4) of a page the scope audits. */
export function auditPage(scope: PageScope, page: Page, covered: ReadonlySet<string>): Audit {
  const requirements: Requirement[] = [];
  const excluded: Excluded[] = [];
  const used = new Set<number>();
  for (const heading of page.headings.filter((h) => h.level >= 2 && h.level <= 4)) {
    if (covered.has(heading.text)) continue;
    const skip = scope.skip.findIndex(([rule]) => matches(rule, heading));
    const entry = scope.skip[skip];
    if (entry) {
      used.add(skip);
      excluded.push({ page: scope.page, section: heading.text, reason: entry[1] });
    } else if (isContainer(page, heading)) {
      excluded.push({ page: scope.page, section: heading.text, reason: 'container' });
    } else requirements.push(...fromSection(scope, page, heading));
  }
  const stale = scope.skip
    .filter((_, index) => !used.has(index))
    .map(([rule]) => `${scope.page} skip ${String(rule)}`);
  return { requirements, excluded, stale };
}
