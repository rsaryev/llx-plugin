import type { MarketplaceSourceOf } from '../format/marketplace/types.ts';
import type { Rendered } from './result.ts';

/**
 * `claude plugin marketplace list` (plugins/cli-reference.md, "plugin marketplace list"): the text
 * listing and the `--json` array, from the marketplaces the host reads out of its registry. Pure.
 * The layout of a text entry is the kit's (spec/judgments.md); the JSON fields are the docs'.
 */

/** A marketplace hosted on claude.ai has no local clone. */
export interface ClaudeAiSource {
  readonly kind: 'claudeai';
  readonly marketplaceId: string;
  readonly organizationUuid: string;
}

/** The sources the docs' `source` field names: `github`, `git`, `url`, `directory`, `file` and `claudeai`. */
export type ListedSource =
  | MarketplaceSourceOf<'github' | 'git' | 'url' | 'directory' | 'file'>
  | ClaudeAiSource;

export interface ConfiguredMarketplace {
  readonly name: string;
  readonly source: ListedSource;
  /** Where Claude Code cached it; a claude.ai marketplace has none. */
  readonly installLocation?: string;
  /** A claude.ai entry's recorded scope. */
  readonly scope?: string;
  /** A claude.ai entry's status. */
  readonly status?: string;
}

/** A marketplace claude.ai lists for the account that is not added yet. */
export interface ClaudeAiListing {
  readonly name: string;
}

export interface ListRequest {
  readonly marketplaces: readonly ConfiguredMarketplace[];
  readonly fromClaudeAi?: readonly ClaudeAiListing[];
}

/** Every field is a string. */
export type ListedJson = Readonly<Record<string, string>>;

export interface ListPlan {
  /** The `--json` array: configured marketplaces only. */
  readonly json: readonly ListedJson[];
  /** The text lines. */
  readonly text: readonly string[];
  /** What the command prints: the array as the one line with `--json`, else the text; it exits 0. */
  print(json: boolean): Rendered;
}

type Of<K extends ListedSource['kind']> = Extract<ListedSource, { kind: K }>;

interface SourceRow<K extends ListedSource['kind']> {
  /** The JSON fields this source type carries. */
  readonly fields: (source: Of<K>) => ListedJson;
  /** The text after `Source:`. */
  readonly describe: (source: Of<K>) => string;
}

const pinned = (ref: string | undefined): ListedJson => (ref === undefined ? {} : { ref });
const withRef = (text: string, ref: string | undefined): string =>
  ref === undefined ? text : `${text}#${ref}`;

/** The registry: a source added to `ListedSource` fails the typecheck until it has a row. */
const SOURCES: { readonly [K in ListedSource['kind']]: SourceRow<K> } = {
  github: {
    fields: (source) => ({ source: 'github', repo: source.repo, ...pinned(source.ref) }),
    describe: (source) => `GitHub (${withRef(source.repo, source.ref)})`,
  },
  git: {
    fields: (source) => ({ source: 'git', url: source.url, ...pinned(source.ref) }),
    describe: (source) => `Git (${withRef(source.url, source.ref)})`,
  },
  url: {
    fields: (source) => ({ source: 'url', url: source.url }),
    describe: (source) => `URL (${source.url})`,
  },
  directory: {
    fields: (source) => ({ source: 'directory', path: source.path }),
    describe: (source) => `Directory (${source.path})`,
  },
  file: {
    fields: (source) => ({ source: 'file', path: source.path }),
    describe: (source) => `File (${source.path})`,
  },
  claudeai: {
    fields: (source) => ({
      source: 'claudeai',
      marketplaceId: source.marketplaceId,
      organizationUuid: source.organizationUuid,
    }),
    describe: () => 'claude.ai',
  },
};

const fieldsOf = <K extends ListedSource['kind']>(source: Of<K>): ListedJson =>
  SOURCES[source.kind].fields(source);

const describeSource = <K extends ListedSource['kind']>(source: Of<K>): string =>
  SOURCES[source.kind].describe(source);

/** `installLocation` for a cached marketplace; `scope` and `status` when a claude.ai entry records them. */
const placeFields = (marketplace: ConfiguredMarketplace): ListedJson => ({
  ...(marketplace.installLocation === undefined
    ? {}
    : { installLocation: marketplace.installLocation }),
  ...(marketplace.scope === undefined ? {} : { scope: marketplace.scope }),
  ...(marketplace.status === undefined ? {} : { status: marketplace.status }),
});

const jsonOf = (marketplace: ConfiguredMarketplace): ListedJson => ({
  name: marketplace.name,
  ...fieldsOf(marketplace.source),
  ...placeFields(marketplace),
});

const entryLines = (marketplace: ConfiguredMarketplace): readonly string[] => [
  `  ${marketplace.name}`,
  `    Source: ${describeSource(marketplace.source)}`,
];

function textOf(request: ListRequest): readonly string[] {
  const head =
    request.marketplaces.length === 0
      ? ['No marketplaces configured']
      : ['Configured marketplaces:', ...request.marketplaces.flatMap(entryLines)];
  const hosted = request.fromClaudeAi ?? [];
  return hosted.length === 0
    ? head
    : [...head, 'From claude.ai:', ...hosted.map((one) => `  ${one.name}`)];
}

/** The listing: `--json` covers "configured marketplaces only and leaves the section out". */
export function planMarketplaceList(request: ListRequest): ListPlan {
  const json = request.marketplaces.map(jsonOf);
  const text = textOf(request);
  return {
    json,
    text,
    print: (asJson) => ({
      stdout: asJson ? [JSON.stringify(json)] : text,
      stderr: [],
      exitCode: 0,
    }),
  };
}
