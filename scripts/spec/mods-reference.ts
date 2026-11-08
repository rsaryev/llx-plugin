/**
 * What the mods tests need from the mods reference page (plugins/mods/reference.md), read as data: the tests never read the pulled docs (docs/TESTING.md).
 * `bun run spec:extract` writes this as `spec/docs-tables.json`; `check:spec` reads the pulled page
 * again and refuses a snapshot that differs, so the committed copy cannot drift unseen.
 */
import { join } from 'node:path';
import { z } from 'zod';
import { DOCS_DIR, ROOT } from '../docs/location.ts';

/** The committed snapshot (docs/SPEC.md). */
export const DOCS_TABLES_FILE = join(ROOT, 'spec', 'docs-tables.json');

export interface Section {
  readonly heading: string;
  readonly lines: readonly string[];
}

/** The sections of a page at one heading level (`##` or `###`), each with its lines up to the next heading of that level or above. */
export function sectionsOf(page: string, level: 2 | 3, within?: string): readonly Section[] {
  const mark = '#'.repeat(level);
  const above = new RegExp(`^#{1,${level}} `);
  let scope = within === undefined;
  const found: { heading: string; lines: string[] }[] = [];
  for (const line of page.split('\n')) {
    if (line.startsWith('## ')) scope = within === undefined || line === `## ${within}`;
    if (!scope) continue;
    if (line.startsWith(`${mark} `)) found.push({ heading: line.slice(level + 1), lines: [] });
    else if (!above.test(line)) found.at(-1)?.lines.push(line);
  }
  return found;
}

/** The rows of every table in `lines` whose first header is `firstHeader` (any table when omitted), as cells. */
export function tableRows(lines: readonly string[], firstHeader?: string): readonly string[][] {
  const rows: string[][] = [];
  let keep = false;
  let header = true;
  for (const line of lines) {
    if (!line.startsWith('|')) {
      header = true;
      continue;
    }
    const cells = line
      .slice(1, line.lastIndexOf('|'))
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim());
    if (header) {
      keep = firstHeader === undefined || cells[0] === firstHeader;
      header = false;
    } else if (keep && !/^:?-+:?$/.test(cells[0] ?? '')) rows.push(cells);
  }
  return rows;
}

/** Every `code` token of a cell. */
export const codeTokens = (cell: string): string[] =>
  [...cell.matchAll(/`([^`]+)`/g)].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));

const SURFACE_COLUMNS = ['terminal', 'desktop', 'vscode'] as const;
const SURFACE_WORDS = [
  ['Terminal', 'terminal'],
  ['Desktop', 'desktop'],
  ['VS Code', 'vscode'],
] as const;
const REQUESTS = [
  ["The pane's", 'pane-id'],
  ['One instance', 'instance'],
  ['The message id', 'message-id'],
  ['The tool call id', 'tool-call-id'],
  ['The agent id', 'agent-id'],
] as const;
/** The first heading of each group of § Events that holds an event table, as the page names it. */
const EVENT_HEADINGS = [
  'Tools',
  'Prompts and what Claude reads',
  'Commands and configuration',
  'Turns',
  'Session',
  'Subagents',
  'Interface',
  'Other mods',
  'Telemetry',
];

export const snapshotSchema = z.strictObject({
  /** § Events: the events of each group, in the page's order. */
  events: z.array(z.strictObject({ group: z.string(), events: z.array(z.string()) })),
  /** § Mods API methods: each namespace (`$.` removed) and its methods. */
  apiMethods: z.array(z.strictObject({ namespace: z.string(), methods: z.array(z.string()) })),
  /** The `status` values the `$.agent` row lists. */
  agentStatuses: z.array(z.string()),
  /**
   * § Limits: each row as a short label (the first words of its first cell) and the amounts its
   * second cell writes (`10 seconds`, `4 MiB`, `28,000 levels`). Facts and labels only, never the
   * page's sentences: the snapshot is committed (docs/SPEC.md, "Requirements").
   */
  limits: z.array(z.strictObject({ limit: z.string(), value: z.string() })),
  /** § Elements: each element, the props its row names and the apps that draw it. */
  elements: z.array(
    z.strictObject({
      name: z.string(),
      props: z.array(z.string()),
      surfaces: z.array(z.enum(SURFACE_COLUMNS)),
    }),
  ),
  /** § Elements, "`Box` border styles". */
  borderStyles: z.array(z.string()),
  /** § Render sites: each row's sites, props, request and apps. */
  renderSites: z.array(
    z.strictObject({
      sites: z.array(z.string()),
      props: z.array(z.string()),
      request: z.enum(['pane-id', 'instance', 'message-id', 'tool-call-id', 'agent-id']).nullable(),
      surfaces: z.array(z.enum(SURFACE_COLUMNS)),
    }),
  ),
  /** § Settings and environment variables: the names. */
  settings: z.array(z.string()),
});
export type DocsTables = z.infer<typeof snapshotSchema>;

/** The first words of a row's first cell: enough to tell the rows apart, not the page's sentence. */
const LABEL_WORDS = 5;
const labelOf = (cell: string): string => cell.split(/\s+/).slice(0, LABEL_WORDS).join(' ');

/** A number, and the unit or phrase the page writes right after it. */
const AMOUNT =
  /\d[\d,]*(?:\.\d+)?(?: (?:MiB|seconds?|milliseconds|minutes|characters|levels|entries|terminal columns|a second|in the terminal|after|by default))?/g;
const amountsOf = (cell: string): string =>
  [...cell.replaceAll(/\(https?:[^)]*\)|v\d+\.\d+\.\d+/g, '').matchAll(AMOUNT)]
    .map((match) => match[0])
    .join('; ');

const firstToken = (cell: string | undefined): string => codeTokens(cell ?? '')[0] ?? '';
const levelTwo = (page: string, heading: string): readonly string[] =>
  sectionsOf(page, 2).find((section) => section.heading === heading)?.lines ?? [];

function eventsOf(page: string): DocsTables['events'] {
  const groups = sectionsOf(page, 3, 'Events').filter((s) => EVENT_HEADINGS.includes(s.heading));
  return groups.map((section) => ({
    group: section.heading,
    events: tableRows(section.lines, 'Event').flatMap((cells) => codeTokens(cells[0] ?? '')),
  }));
}

/** The names of a row of § Mods API methods: the first list of `code` words, after at most a lead-in such as `Reactive state: `. */
const methodsOf = (cell: string): string[] =>
  codeTokens(/^(?:[^`]*: )?((?:`[A-Za-z]+`(?:, )?)+)/.exec(cell)?.[1] ?? '');

function renderSitesOf(page: string): DocsTables['renderSites'] {
  return tableRows(levelTwo(page, 'Render sites'), 'Site').map((cells) => ({
    sites: codeTokens(cells[0] ?? ''),
    props: codeTokens(cells[1] ?? ''),
    request: REQUESTS.find(([start]) => (cells[2] ?? '').startsWith(start))?.[1] ?? null,
    surfaces: SURFACE_WORDS.filter(([word]) => (cells[3] ?? '').includes(word)).map(
      ([, surface]) => surface,
    ),
  }));
}

/** Reads the snapshot from the two pages' Markdown. */
export function readDocsTables(modsReference: string): DocsTables {
  const api = levelTwo(modsReference, 'Mods API methods');
  const agentRow = api.find((line) => line.startsWith('| `$.agent`')) ?? '';
  const listed = /`status` of (.*?), where/.exec(agentRow)?.[1] ?? '';
  const borders = sectionsOf(modsReference, 3, 'Elements').find(
    (section) => section.heading === '`Box` border styles',
  );
  return snapshotSchema.parse({
    events: eventsOf(modsReference),
    apiMethods: tableRows(api).map((cells) => ({
      namespace: firstToken(cells[0]).replace(/^\$\./, ''),
      methods: methodsOf(cells[1] ?? ''),
    })),
    agentStatuses: [...listed.matchAll(/`([a-z]+)`/g)].flatMap((m) => (m[1] ? [m[1]] : [])),
    limits: tableRows(levelTwo(modsReference, 'Limits'), 'Limit').map((cells) => ({
      limit: labelOf(cells[0] ?? ''),
      value: amountsOf(cells[1] ?? ''),
    })),
    elements: tableRows(levelTwo(modsReference, 'Elements'), 'Element').map((cells) => ({
      name: firstToken(cells[0]),
      props: codeTokens(cells[1] ?? ''),
      surfaces: SURFACE_COLUMNS.filter((_surface, index) => cells[2 + index] === '✓'),
    })),
    borderStyles: tableRows(borders?.lines ?? [], '`borderStyle`').map((cells) =>
      firstToken(cells[0]).replaceAll("'", ''),
    ),
    renderSites: renderSitesOf(modsReference),
    settings: tableRows(
      levelTwo(modsReference, 'Settings and environment variables'),
      'Name',
    ).flatMap((cells) => codeTokens(cells[0] ?? '')),
  });
}

/** tools-reference.md: each tool with "Permission required", and the tools each rule format applies to. */
export function readToolsReference(page: string): {
  readonly tools: readonly { readonly tool: string; readonly permissionRequired: boolean }[];
  readonly ruleFormats: readonly { readonly rule: string; readonly appliesTo: readonly string[] }[];
} {
  const head = page.split('\n## ')[0]?.split('\n') ?? [];
  const formats = levelTwo(page, 'Configure tools with permission rules and hooks');
  return {
    tools: tableRows(head, 'Tool').map((cells) => ({
      tool: firstToken(cells[0]),
      permissionRequired: (cells[2] ?? '').startsWith('Yes'),
    })),
    ruleFormats: tableRows(formats, 'Rule format').map((cells) => ({
      rule: firstToken(cells[0]),
      appliesTo: (cells[1] ?? '').split(',').map((tool) => tool.trim()),
    })),
  };
}

/** The snapshot of the pulled mods reference, or undefined when the docs are not pulled. */
export async function pulledDocsTables(): Promise<DocsTables | undefined> {
  const mods = Bun.file(join(DOCS_DIR, 'plugins', 'mods', 'reference.md'));
  return (await mods.exists()) ? readDocsTables(await mods.text()) : undefined;
}

export async function readCommittedDocsTables(): Promise<DocsTables> {
  return snapshotSchema.parse(await Bun.file(DOCS_TABLES_FILE).json());
}
