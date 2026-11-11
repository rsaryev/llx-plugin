import { errorAt, type Finding } from './finding.ts';
import { isRecord } from '../../protocol/is-record.ts';

/**
 * The paths a manifest names that the validator then looks for on disk (oracle 2.1.319). A path
 * with a `..` segment is refused outright; the rest are claims the caller checks against the files:
 * `Path not found`, or for `skills` a file where a directory is due.
 */
export interface PathClaim {
  /** Where the oracle puts the report: `skills[0]`, `commands.a.source`, `mcpServers`. */
  readonly path: string;
  readonly value: string;
  /** The entry must be a directory holding `SKILL.md`. */
  readonly directory: boolean;
  /** The loader skips a missing file here without reporting it (an MCP servers file). */
  readonly skippedWhenMissing: boolean;
}

/** The validator's message for a path with `..` (manifest-reference.md, "Containment and existence"). */
const TRAVERSAL = 'Path contains ".." which could be a path traversal attempt';

/** Keys whose single string is reported as the first entry of a list (`skills[0]`). */
const LISTED = new Set(['skills', 'agents', 'hooks', 'workflows']);
/** Keys whose value is checked on disk. */
const CHECKED = [
  'skills',
  'commands',
  'agents',
  'hooks',
  'mcpServers',
  'lspServers',
  'outputStyles',
  'workflows',
  'themes',
  'monitors',
  'types',
] as const;

const REMOTE = /^https?:\/\//i;
const isRelative = (value: string): boolean => !REMOTE.test(value);

function entriesOf(key: string, value: unknown): ReadonlyArray<readonly [string, string]> {
  if (typeof value === 'string') return [[LISTED.has(key) ? `${key}[0]` : key, value]];
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      typeof entry === 'string' ? [[`${key}[${index}]`, entry] as const] : [],
    );
  }
  if (key === 'commands' && isRecord(value)) {
    return Object.entries(value).flatMap(([name, entry]) =>
      isRecord(entry) && typeof entry.source === 'string'
        ? [[`commands.${name}.source`, entry.source] as const]
        : [],
    );
  }
  return [];
}

export function claimsOf(manifest: Readonly<Record<string, unknown>>): {
  readonly claims: readonly PathClaim[];
  readonly findings: readonly Finding[];
} {
  const listed = CHECKED.flatMap((key) =>
    entriesOf(key, manifest[key]).map(([path, value]) => ({
      path,
      value,
      directory: key === 'skills',
      skippedWhenMissing: key === 'mcpServers' && value.endsWith('.json'),
    })),
  );
  const { experimental } = manifest;
  const experimentalEntries = isRecord(experimental)
    ? (['themes', 'monitors'] as const).flatMap((key) =>
        entriesOf(`experimental.${key}`, experimental[key]).map(([path, value]) => ({
          path,
          value,
          directory: false,
          skippedWhenMissing: false,
        })),
      )
    : [];
  const all = [...listed, ...experimentalEntries].filter((claim) => isRelative(claim.value));
  const refused = all.filter((claim) => claim.value.split('/').includes('..'));
  return {
    claims: all.filter((claim) => !refused.includes(claim)),
    findings: refused.map((claim) => errorAt(claim.path, `${TRAVERSAL}: ${claim.value}`)),
  };
}
