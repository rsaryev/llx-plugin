/**
 * The audit of the docs pages a host needs (docs/SPEC.md, "Sections and scope"). Tables give most
 * requirements; the rest of a page is prose, and prose states behaviour too. Every heading of an
 * audited page is therefore classified: it holds a table the table rules read, it becomes
 * requirements (one per section, or one per top-level item when the section lists several rules),
 * or it is out of scope for a reason named here. A section is included unless a skip names it, so a
 * section Anthropic adds shows up as an unproven requirement instead of going missing silently; a
 * skip that matches nothing stops the extraction.
 */
import type { Heading } from './markdown.ts';
import type { Category } from './sources.ts';

/** Why a section holds no requirement. Each excluded heading names exactly one. */
export const REASONS = {
  navigation: 'Links to other pages (next steps, see also, related resources); no behaviour.',
  container: 'Only groups sub-sections, which are classified on their own.',
  runtime: "Claude Code's own interface, sandbox, model or account setting; a host has its own.",
  ui: "Describes Claude Code's own terminal, menu or dialog; nothing a host observes or implements.",
  tutorial: 'A walkthrough or sample; the behaviour it shows is stated in another section.',
  advice: 'Guidance for a person (when to use a feature, how to choose); no rule to implement.',
  service: 'Needs an Anthropic-hosted service (claude.ai sync, directory submission, connectors).',
  telemetry: "Claude Code's own telemetry and analytics pipelines; a host reports as it chooses.",
  builtin: 'Describes what ships inside Claude Code (built-in skills, styles, modes), not loading.',
  model: "Claude Code's model-side machinery (classifier, caching, routing); not plugin handling.",
  tooling: 'A Claude Code developer tool (evals, test kit, scaffolding) a host has no use for.',
  machine: "The user's shell, terminal, git or network setup rather than a rule of the product.",
  duplicate: 'Restates a rule a requirement already covers, on another page or section.',
} as const;
export type Reason = keyof typeof REASONS;

/** Sends a heading (and the headings under it) to another category than the page's. */
export interface Route {
  readonly category: Category;
  /** The heading's own text. */
  readonly heading?: RegExp;
  /** Any heading that contains it. */
  readonly parent?: RegExp;
}

/** A heading's exact text, a pattern for it, or a test of the whole heading. */
export type Matcher = string | RegExp | ((heading: Heading) => boolean);
export type Skip = readonly [match: Matcher, reason: Reason];

/** Headings that sit under a heading whose text matches. */
export const under =
  (parent: RegExp, except?: RegExp) =>
  (heading: Heading): boolean =>
    heading.parents.some((text) => parent.test(text)) && !except?.test(heading.text);

export interface PageScope {
  readonly page: string;
  /** The category of every included section unless a route says otherwise. */
  readonly category: Category;
  /** The id's second part; the page's file name in camelCase when omitted. */
  readonly slug?: string;
  readonly routes?: readonly Route[];
  /** Sections that stay one requirement however many items or rows they list. */
  readonly whole?: readonly Matcher[];
  /**
   * Sections whose table names its rows by a phrase ("Any of those locations and a bundled skill"):
   * the whole first cell is the row's identifier, however long. Elsewhere a long first cell is a
   * sentence, not an identifier, and gives no requirement.
   */
  readonly phrases?: readonly Matcher[];
  readonly skip: readonly Skip[];
  /**
   * Single labelled items of an included section that are out of scope, as [section heading, item
   * label, reason]: the section's other items stay requirements. One that matches nothing stops
   * the extraction, as a skip does.
   */
  readonly skipItems?: readonly ItemSkip[];
}

export type ItemSkip = readonly [section: string, item: string, reason: Reason];

const camel = (text: string): string =>
  text.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase());

/** `outputStyles` for `output-styles`, as the existing ids spell categories. */
export const idPrefix = (category: Category): string => camel(category);

export const slugOf = (scope: PageScope): string =>
  scope.slug ?? camel(scope.page.replace(/\.md$/, '').split('/').at(-1) ?? scope.page);

export const NAVIGATION: Skip = [
  /^(Next steps|See also|Related resources|What's next)$/,
  'navigation',
];
