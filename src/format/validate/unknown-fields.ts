import { warningAt, type Finding } from './finding.ts';

/**
 * What `claude plugin validate` says about a key it does not know (oracle 2.1.319). Claude Code
 * ignores such a key at load time; the validator tells the author why it is probably there:
 * a field of the marketplace entry, another tool's manifest, or a misspelling.
 */

/** Fields of a marketplace entry that a `plugin.json` does not read. */
const MARKETPLACE_ONLY = new Set(['category', 'tags', 'strict', 'id', 'source']);

/** Other tools' manifests, by the label the validator gives them: field, then where it is commonly seen. */
const COMMONLY_SEEN: Readonly<Record<string, string>> = Object.fromEntries(
  (
    [
      [
        'a VS Code/Cursor extension manifest',
        [
          'publisher',
          'categories',
          'engines',
          'activationEvents',
          'contributes',
          'preview',
          'icon',
        ],
      ],
      [
        'an npm package.json',
        ['scripts', 'bin', 'files', 'private', 'contributors', 'main', 'type'],
      ],
      ['an MCPB/DXT manifest', ['dxt_version', 'mcpb_version', 'compatibility']],
      ['an MCP server manifest', ['tools', 'prompts', 'server', 'resources']],
      [
        'manifests across many tools',
        [
          'privacy_policies',
          '_comment',
          'changelog',
          'logo',
          'readme',
          'support',
          'privacy_policy',
        ],
      ],
      ['a JSON Schema document', ['$comment', '$id']],
    ] as const
  ).flatMap(([label, keys]) => keys.map((key) => [key, label] as const)),
);

/** A spelling other tools use for a field Claude Code reads under another name. */
const CROSS_TOOL: Readonly<Record<string, string>> = { user_config: 'userConfig' };

/**
 * A misspelling is a known key at most this far away (compared without case, `_`, `-` and `$`),
 * and never more than half its own length: `npm` is not taken for `name`, `note` is.
 */
const MAX_DISTANCE = 2;
const MIN_LENGTH = 3;

const squash = (key: string): string => key.toLowerCase().replaceAll(/[^a-z0-9]/g, '');

function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      const same = a[row - 1] === b[column - 1] ? 0 : 1;
      current[column] = Math.min(
        (previous[column] ?? 0) + 1,
        (current[column - 1] ?? 0) + 1,
        (previous[column - 1] ?? 0) + same,
      );
    }
    previous = current;
  }
  return previous[b.length] ?? Infinity;
}

/** The known key the unknown one most likely meant, if any is close enough. */
function closest(key: string, known: readonly string[]): string | undefined {
  if (key.length < MIN_LENGTH) return undefined;
  const wanted = squash(key);
  const reach = Math.min(MAX_DISTANCE, Math.floor(wanted.length / 2));
  let best: { readonly key: string; readonly distance: number } | undefined;
  for (const candidate of known) {
    const far = distance(wanted, squash(candidate));
    if (far <= reach && (best === undefined || far < best.distance)) {
      best = { key: candidate, distance: far };
    }
  }
  return best?.key;
}

const IGNORED_AT_LOAD = 'Claude Code ignores it at load time.';

/** Where the key was found: only a manifest is told that a key belongs in the marketplace entry. */
export const FIELD_SITES = ['manifest', 'other'] as const;
export type FieldSite = (typeof FIELD_SITES)[number];

const TELLS_ENTRY_FIELDS: { readonly [S in FieldSite]: boolean } = { manifest: true, other: false };

/** The warning for a key `known` does not list, at `path`. */
export function unknownFieldFinding(
  key: string,
  known: readonly string[],
  path: string = key,
  site: FieldSite = 'manifest',
): Finding {
  const crossTool = Object.hasOwn(CROSS_TOOL, key) ? CROSS_TOOL[key] : undefined;
  if (crossTool !== undefined) {
    return warningAt(
      path,
      `Field '${key}' is the cross-tool spelling of Claude Code's '${crossTool}'. Rename it to '${crossTool}' for Claude Code to read it (the option shapes differ slightly — re-run validate after renaming to check). As-is, Claude Code ignores it at load time.`,
    );
  }
  if (TELLS_ENTRY_FIELDS[site] && MARKETPLACE_ONLY.has(key)) {
    return warningAt(
      path,
      `Field '${key}' belongs in the marketplace entry (marketplace.json), not plugin.json. It's harmless here but unused — ${IGNORED_AT_LOAD}`,
    );
  }
  const seen = Object.hasOwn(COMMONLY_SEEN, key) ? COMMONLY_SEEN[key] : undefined;
  if (seen !== undefined) {
    return warningAt(
      path,
      `Unknown field '${key}' (commonly seen in ${seen}). Claude Code ignores unrecognized fields at load time, so it's safe to keep.`,
    );
  }
  const meant = closest(key, known);
  if (meant !== undefined) {
    return warningAt(
      path,
      `Unknown field '${key}' — did you mean '${meant}'? Claude Code ignores unrecognized fields at load time, so this field has no effect.`,
    );
  }
  return warningAt(path, `Unknown field '${key}'. ${IGNORED_AT_LOAD}`);
}
