import { error } from '../issues.ts';
import type { EntrySlot } from './marketplace.ts';
import { isRecord } from './marketplace-schema.ts';
import {
  OBJECT_PARSERS,
  type ObjectKind,
  type ObjectParser,
  type Parsed,
} from './plugin-source-kinds.ts';
import { invalidInput, type SourceSite } from './plugin-source-fields.ts';
import type { SourceReading } from './entries.ts';

/**
 * Reading a plugin entry's `source` (plugins/marketplace-reference.md, "Plugin sources", "Relative
 * path plugin source", "Bare names under pluginRoot", "Validation messages"): a relative path
 * string, or an object whose own `source` key names one of the other six types. It is the
 * `SourceParser` the entry reader is given (`createEntryReader(parsePluginSource)`).
 */

const MUST_START = 'Invalid string: must start with "./"';

/** The tag `source: 'unsupported'` is the SDK's placeholder, not an authorable type. */
const PLACEHOLDER_MESSAGE =
  "source.source: 'unsupported' is a parse-time placeholder and cannot be authored";
const PLACEHOLDER_TAG = 'unsupported';

const isObjectKind = (tag: string): tag is ObjectKind => Object.hasOwn(OBJECT_PARSERS, tag);

const outcome = (parsed: Parsed): SourceReading =>
  'kind' in parsed ? { source: parsed, issues: [] } : { source: undefined, issues: parsed };

/** `./a/b/` and `a/b/` as `a/b`; the root (`.`, `./`) as `.`. */
function tidy(path: string): string {
  const trimmed = path.replace(/^(\.\/)+/, '').replace(/\/+$/, '');
  return trimmed === '' || trimmed === '.' ? '.' : trimmed;
}

const isAbsolute = (path: string): boolean => path.startsWith('/') || /^[A-Za-z]:/.test(path);

/**
 * `metadata.pluginRoot` "must itself be a relative path inside the marketplace": no `..`, not
 * absolute, not empty. Written with or without `./` (spec/judgments.md).
 */
function rootPath(pluginRoot: string, site: SourceSite): string | undefined {
  const path = site.platform === 'windows' ? pluginRoot.replaceAll('\\', '/') : pluginRoot;
  const bad = path === '' || path.includes('..') || path.includes('\\') || isAbsolute(path);
  return bad ? undefined : tidy(path);
}

/** A bare name: "a single directory name with no `/`", resolved under `metadata.pluginRoot`. */
function bareName(raw: string, site: SourceSite): SourceReading {
  const root = site.pluginRoot === undefined ? undefined : rootPath(site.pluginRoot, site);
  if (site.pluginRoot === undefined || raw.includes('/') || raw === '') {
    return { source: undefined, issues: [error(site.path, MUST_START)] };
  }
  if (root === undefined) {
    return {
      source: undefined,
      issues: [
        error(
          site.path,
          `metadata.pluginRoot "${site.pluginRoot}" must be a relative path inside the marketplace, so "${raw}" cannot resolve under it`,
        ),
      ],
    };
  }
  const path = root === '.' ? raw : `${root}/${raw}`;
  return { source: { kind: 'relative', path, bare: true }, issues: [] };
}

function relative(raw: string, site: SourceSite): SourceReading {
  if (raw.includes('..')) {
    return { source: undefined, issues: [error(site.path, `Path contains "..": ${raw}`)] };
  }
  if (raw === '.' || raw.startsWith('./')) return withSeparators(raw, site);
  return bareName(raw, site);
}

/** On macOS and Linux a backslash after the leading `./` is refused; on Windows it is a separator. */
function withSeparators(raw: string, site: SourceSite): SourceReading {
  const rest = raw === '.' ? '' : raw.slice(2);
  if (site.platform === 'posix' && rest.includes('\\')) {
    return {
      source: undefined,
      issues: [
        error(site.path, `Path contains a backslash: ${raw}. Write the path with forward slashes`),
      ],
    };
  }
  const path = tidy(rest.replaceAll('\\', '/'));
  return { source: { kind: 'relative', path, bare: false }, issues: [] };
}

function fromObject(raw: Readonly<Record<string, unknown>>, site: SourceSite): SourceReading {
  const tag = raw.source;
  if (tag === PLACEHOLDER_TAG) {
    return { source: undefined, issues: [error(site.path, PLACEHOLDER_MESSAGE)] };
  }
  if (typeof tag !== 'string' || !isObjectKind(tag)) {
    return { source: undefined, issues: invalidInput(site) };
  }
  const parser: ObjectParser = OBJECT_PARSERS[tag];
  return outcome(parser(raw, site));
}

/** The plugin source of `plugins[i]`: the source, or `undefined` with the issues that say why. */
export function parsePluginSource(raw: unknown, slot: EntrySlot): SourceReading {
  const site: SourceSite = {
    path: `plugins[${slot.index}].source`,
    platform: slot.context.platform ?? 'posix',
    ...(slot.pluginRoot === undefined ? {} : { pluginRoot: slot.pluginRoot }),
  };
  if (typeof raw === 'string') return relative(raw, site);
  if (isRecord(raw)) return fromObject(raw, site);
  return { source: undefined, issues: invalidInput(site) };
}
