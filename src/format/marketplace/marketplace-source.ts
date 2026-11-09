import { z } from 'zod';
import { blocksLoading, error, warning, type PluginIssue } from '../issues.ts';
import { defined } from '../defined.ts';
import { isRecord, readOwner, unknownField } from './marketplace-schema.ts';
import { marketplaceNameIssues } from './marketplace-names.ts';
import { zodIssues } from './schema-issues.ts';
import { readSettingsPlugins } from './settings-source-plugins.ts';
import type {
  MarketplaceLoadStatus,
  MarketplaceSource,
  MarketplaceSourceKind,
  SourceParseResult,
} from './types.ts';

/**
 * Reading a marketplace source object (plugins/marketplace-reference.md, "Marketplace sources",
 * "Fields by type", "Source values valid only in policy lists", "Source objects in settings"): the
 * `source` of an `extraKnownMarketplaces` value, or an entry of `strictKnownMarketplaces` and
 * `blockedMarketplaces`. `policy` says which of the three keys the object is in. Issue paths are
 * relative to the source object (`repo`, `plugins[0].name`); the caller prefixes its own.
 */

export interface MarketplaceSourceOptions {
  /** The object is an entry of `strictKnownMarketplaces` or `blockedMarketplaces`. */
  readonly policy: boolean;
  /** The `extraKnownMarketplaces` key; a `settings` source's `name` must equal it. */
  readonly key?: string;
}

/** What the `path` of a `github` or `git` source defaults to ("Fields by type"). */
export const DEFAULT_MARKETPLACE_PATH = '.claude-plugin/marketplace.json';

interface Built {
  readonly source?: MarketplaceSource;
  readonly issues?: readonly PluginIssue[];
  readonly status?: MarketplaceLoadStatus;
}
type Reader = (
  raw: Readonly<Record<string, unknown>>,
  options: MarketplaceSourceOptions,
) => Built & {
  readonly fieldIssues: readonly PluginIssue[];
};

const Text = z.string();
const Flag = z.boolean();
const TextList = z.array(z.string());
const HeaderMap = z.record(z.string(), z.string());

/** A required key that is absent is `Invalid input`; a present one is read by its own schema. */
function readFields(
  shape: Readonly<Record<string, z.ZodType>>,
  raw: Readonly<Record<string, unknown>>,
): { readonly kept: Record<string, unknown>; readonly issues: PluginIssue[] } {
  const kept: Record<string, unknown> = {};
  const issues: PluginIssue[] = [];
  for (const [key, schema] of Object.entries(shape)) {
    const value = Object.hasOwn(raw, key) ? raw[key] : undefined;
    if (value === undefined) {
      if (!schema.safeParse(undefined).success) issues.push(error(key, 'Invalid input'));
      continue;
    }
    const parsed = schema.safeParse(value);
    if (parsed.success) kept[key] = parsed.data;
    else issues.push(...zodIssues(parsed.error, key));
  }
  return { kept, issues };
}

/** A key the type does not have: "Claude Code ignores it at load time". */
const unknownKeys = (
  shape: Readonly<Record<string, z.ZodType>>,
  raw: Readonly<Record<string, unknown>>,
): PluginIssue[] =>
  Object.keys(raw)
    .filter((key) => key !== 'source' && !Object.hasOwn(shape, key))
    .map((key) => unknownField(key, key, Object.keys(shape)));

/** One reader per type: the schema of its fields, and what the parsed fields build. */
function reader<S extends z.ZodObject>(
  schema: S,
  build: (fields: z.output<S>, options: MarketplaceSourceOptions) => Built,
): Reader {
  return (raw, options) => {
    const shape: Readonly<Record<string, z.ZodType>> = schema.shape;
    const { kept, issues } = readFields(shape, raw);
    const unknown = unknownKeys(shape, raw);
    const whole = schema.safeParse(kept);
    if (issues.length > 0 || !whole.success) {
      return { fieldIssues: [...issues, ...unknown] };
    }
    const built = build(whole.data, options);
    return { ...built, fieldIssues: [...unknown, ...(built.issues ?? [])] };
  };
}

const WILDCARD_WARNING =
  'The owner wildcard "<owner>/*" is valid only in strictKnownMarketplaces and blockedMarketplaces; here Claude Code takes it literally and the clone fails';

/** `owner/*` outside a policy list names no single repository ("Fields by type", `repo`). */
function repoBuilt(repo: string, policy: boolean): Pick<Built, 'issues' | 'status'> {
  if (policy || !repo.endsWith('/*')) return {};
  return {
    issues: [warning('repo', WILDCARD_WARNING)],
    status: 'fails: The owner wildcard names no single repository to clone',
  };
}

const GIT_FIELDS = {
  ref: Text.optional(),
  path: Text.optional(),
  sparsePaths: TextList.optional(),
  skipLfs: Flag.optional(),
};

/** The settings source: its name, its inline catalog and its owner. */
function settingsBuilt(
  fields: { readonly name: string; readonly plugins: readonly unknown[]; readonly owner?: unknown },
  raw: Readonly<Record<string, unknown>>,
  options: MarketplaceSourceOptions,
): Built {
  const nameIssues =
    options.key !== undefined && options.key !== fields.name
      ? [
          error(
            'name',
            `Marketplace name "${fields.name}" must equal the extraKnownMarketplaces key "${options.key}"`,
          ),
        ]
      : [];
  const reserved = marketplaceNameIssues(fields.name).filter((found) => found.severity === 'error');
  const owner = fields.owner === undefined ? undefined : readOwner(raw.owner);
  const catalog = readSettingsPlugins(fields.plugins);
  const issues = [...nameIssues, ...reserved, ...(owner?.issues ?? []), ...catalog.issues];
  if (blocksLoading([...nameIssues, ...reserved, ...(owner?.issues ?? [])])) return { issues };
  return {
    issues,
    source: {
      kind: 'settings',
      name: fields.name,
      plugins: catalog.plugins,
      ...defined({ owner: owner?.value }),
    },
  };
}

const settingsSchema = z.object({
  name: Text,
  plugins: z.array(z.unknown()),
  owner: z.unknown().optional(),
});

const READERS: { readonly [K in MarketplaceSourceKind]: Reader } = {
  url: reader(
    z.object({ url: Text, headers: HeaderMap.optional(), headersHelper: Text.optional() }),
    ({ url, headers, headersHelper }) => ({
      source: { kind: 'url', url, ...defined({ headers, headersHelper }) },
    }),
  ),
  github: reader(z.object({ repo: Text, ...GIT_FIELDS }), (fields, options) => ({
    ...repoBuilt(fields.repo, options.policy),
    source: {
      kind: 'github',
      repo: fields.repo,
      path: fields.path ?? DEFAULT_MARKETPLACE_PATH,
      ...defined({ ref: fields.ref, sparsePaths: fields.sparsePaths, skipLfs: fields.skipLfs }),
    },
  })),
  git: reader(z.object({ url: Text, ...GIT_FIELDS }), (fields) => ({
    source: {
      kind: 'git',
      url: fields.url,
      path: fields.path ?? DEFAULT_MARKETPLACE_PATH,
      ...defined({ ref: fields.ref, sparsePaths: fields.sparsePaths, skipLfs: fields.skipLfs }),
    },
  })),
  // `version` and `registry` are the SDK's shape of an npm source, not the docs' table (spec/judgments.md).
  npm: reader(
    z.object({ package: Text, version: Text.optional(), registry: Text.optional() }),
    ({ package: name, version, registry }) => ({
      source: { kind: 'npm', package: name, ...defined({ version, registry }) },
    }),
  ),
  file: reader(z.object({ path: Text }), ({ path }) => ({ source: { kind: 'file', path } })),
  directory: reader(z.object({ path: Text }), ({ path }) => ({
    source: { kind: 'directory', path },
  })),
  settings: (raw, options) => {
    const shape: Readonly<Record<string, z.ZodType>> = settingsSchema.shape;
    const { kept, issues } = readFields(shape, raw);
    const unknown = unknownKeys(shape, raw);
    const whole = settingsSchema.safeParse(kept);
    if (issues.length > 0 || !whole.success) return { fieldIssues: [...issues, ...unknown] };
    const built = settingsBuilt(whole.data, raw, options);
    return { ...built, fieldIssues: [...unknown, ...(built.issues ?? [])] };
  },
  'skills-dir': reader(z.object({}), () => ({ source: { kind: 'skills-dir' } })),
  hostPattern: reader(z.object({ hostPattern: Text }), ({ hostPattern }) => ({
    source: { kind: 'hostPattern', hostPattern },
  })),
  pathPattern: reader(z.object({ pathPattern: Text }), ({ pathPattern }) => ({
    source: { kind: 'pathPattern', pathPattern },
  })),
};

/** What `extraKnownMarketplaces` does with each type ("Marketplace sources", the table). */
const LOAD_STATUS: { readonly [K in MarketplaceSourceKind]: MarketplaceLoadStatus } = {
  url: 'loads',
  github: 'loads',
  git: 'loads',
  npm: 'fails: NPM marketplace sources not yet implemented',
  file: 'loads',
  directory: 'loads',
  settings: 'loads',
  'skills-dir': 'fails: Unsupported marketplace source type',
  hostPattern: 'fails: Unsupported marketplace source type',
  pathPattern: 'fails: Unsupported marketplace source type',
};

/** Types a policy list takes and `extraKnownMarketplaces` cannot load: the notice outside a policy list. */
const OUTSIDE_POLICY: { readonly [K in MarketplaceSourceKind]: string | undefined } = {
  url: undefined,
  github: undefined,
  git: undefined,
  file: undefined,
  directory: undefined,
  settings: undefined,
  npm: 'An npm marketplace source fails to load in extraKnownMarketplaces: NPM marketplace sources not yet implemented',
  'skills-dir':
    'A skills-dir source is valid only in strictKnownMarketplaces and blockedMarketplaces; elsewhere it fails to load: Unsupported marketplace source type',
  hostPattern:
    'A hostPattern source is valid only in strictKnownMarketplaces and blockedMarketplaces; elsewhere it fails to load: Unsupported marketplace source type',
  pathPattern:
    'A pathPattern source is valid only in strictKnownMarketplaces and blockedMarketplaces; elsewhere it fails to load: Unsupported marketplace source type',
};

const isKind = (tag: unknown): tag is MarketplaceSourceKind =>
  typeof tag === 'string' && Object.hasOwn(READERS, tag);

/** A source that matches no type: `Invalid input`, and nothing Claude Code can load. */
const INVALID: SourceParseResult = {
  source: undefined,
  issues: [error('source', 'Invalid input')],
  loadStatus: 'fails: Unsupported marketplace source type',
};

/**
 * The marketplace source an object describes. `loadStatus` is what `extraKnownMarketplaces` does
 * with it, whichever key it is in: a type Claude Code parses can still fail to load, and an object
 * that matches no source type (`source` is undefined) loads nothing. Never throws.
 */
export function parseMarketplaceSource(
  raw: unknown,
  options: MarketplaceSourceOptions,
): SourceParseResult {
  if (!isRecord(raw) || !isKind(raw.source)) return INVALID;
  const kind = raw.source;
  const read = READERS[kind](raw, options);
  const notice = options.policy ? undefined : OUTSIDE_POLICY[kind];
  const issues = [
    ...read.fieldIssues,
    ...(notice === undefined || read.source === undefined ? [] : [warning('source', notice)]),
  ];
  return {
    source: read.source,
    issues,
    loadStatus: read.source === undefined ? INVALID.loadStatus : (read.status ?? LOAD_STATUS[kind]),
  };
}
