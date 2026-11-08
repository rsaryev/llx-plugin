/**
 * The page-level audit (docs/SPEC.md, "Pages and scope"): every page of the pulled docs is either
 * audited section by section (`SCOPES`) or listed in `spec/out-of-scope-pages.json` with one of
 * the reasons below, so a page Anthropic adds is classified by a person before the gate passes.
 */
import { join } from 'node:path';
import { z } from 'zod';
import { ROOT } from '../docs/location.ts';

/** The committed list of pages the audit leaves out, each with its reason. */
export const OUT_OF_SCOPE_PAGES_FILE = join(ROOT, 'spec', 'out-of-scope-pages.json');

/** Why a whole page holds nothing a plugin host reproduces. */
export const PAGE_REASONS = {
  product:
    'Claude Code surfaces (IDE, desktop, mobile, chat apps, terminal UI) and named services.',
  hosting: 'Cloud sessions, CI, self-hosted environments, gateways, containers and networking.',
  provider: 'Model provider, account, install and authentication setup.',
  billing: 'Cost, usage analytics, telemetry, data handling, legal and compliance.',
  marketing: 'Launch kits, champion guides and prompt libraries.',
  digest: 'Weekly digests and the changelog: a version index, with no rule of its own.',
  guide: 'Overview, quickstart, glossary or advice; every rule it states is on an audited page.',
  engine: "Claude Code's own session, sandbox, context, cache and model machinery.",
  'sdk-api':
    "The Agent SDK's client API (options, streaming, sessions, cost); shapes are its types.",
  duplicate: 'Restates an audited page; the entry names it in `of`.',
} as const;
export type PageReason = keyof typeof PAGE_REASONS;

const entrySchema = z.strictObject({
  page: z.string().min(1),
  reason: z.string().min(1),
  of: z.string().min(1).optional(),
});
export type PageExclusion = z.infer<typeof entrySchema>;

export async function readOutOfScopePages(): Promise<PageExclusion[]> {
  return z.array(entrySchema).parse(await Bun.file(OUT_OF_SCOPE_PAGES_FILE).json());
}

/** Every `.md` page under a docs directory, relative to it, sorted. */
export async function docsPages(dir: string): Promise<string[]> {
  const pages: string[] = [];
  for await (const path of new Bun.Glob('**/*.md').scan({ cwd: dir })) pages.push(path);
  return pages.toSorted();
}

/** What SP7 reports about the pulled pages and the exclusion list. */
export function pageProblems(
  pages: readonly string[] | undefined,
  audited: ReadonlySet<string>,
  excluded: readonly PageExclusion[],
  specDoc: string,
): string[] {
  const problems: string[] = [];
  const listed = new Map(excluded.map((entry) => [entry.page, entry]));
  const pulled = new Set(pages);
  for (const page of pages ?? []) {
    if (!audited.has(page) && !listed.has(page)) {
      problems.push(
        `SP7 ${page} is neither audited (scripts/spec/scope-*.ts) nor in spec/out-of-scope-pages.json`,
      );
    }
  }
  for (const entry of excluded) {
    if (!(entry.reason in PAGE_REASONS)) {
      problems.push(`SP7 ${entry.page}: unknown reason "${entry.reason}"`);
    }
    if (audited.has(entry.page)) problems.push(`SP7 ${entry.page} is audited and also excluded`);
    if (pages && !pulled.has(entry.page))
      problems.push(`SP7 ${entry.page} is not a page of the docs`);
    if (entry.reason === 'duplicate' && !(entry.of && audited.has(entry.of))) {
      problems.push(`SP7 ${entry.page}: "duplicate" must name an audited page in "of"`);
    }
    if (entry.reason !== 'duplicate' && entry.of) {
      problems.push(`SP7 ${entry.page}: only "duplicate" takes "of"`);
    }
  }
  const part = specDoc.slice(specDoc.indexOf('## Pages and scope'));
  for (const reason of Object.keys(PAGE_REASONS)) {
    if (!part.includes(`| \`${reason}\` |`))
      problems.push(`SP7 docs/SPEC.md has no row for "${reason}"`);
  }
  return problems;
}
