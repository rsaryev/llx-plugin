import { warning, type PluginIssue } from '../format/issues.ts';

/**
 * A Git LFS pointer file, which is what an LFS-tracked file is after a clone (plugins/host-
 * marketplace.md, "Keep plugin files out of Git LFS": "The clone never downloads LFS content, so
 * LFS-tracked files arrive as pointer files"). The docs do not describe the pointer's text; the
 * layout is Git LFS's own (a `version` line naming its spec, an `oid sha256:` line, a `size` line),
 * a judgment (spec/judgments.md). A pointer is a small text file, so a host reads at most
 * `MAX_POINTER_BYTES` of a file to ask.
 */

export const MAX_POINTER_BYTES = 1024;

export interface LfsPointer {
  /** The SHA-256 of the real content, lower case hex. */
  readonly oid: string;
  /** The size of the real content in bytes. */
  readonly size: number;
}

const VERSION = /^version https:\/\/git-lfs\.github\.com\/spec\/v\d+$/;
const OID = /^oid sha256:([0-9a-f]{64})$/;
const SIZE = /^size (\d+)$/;

/** The first capture group of `pattern` in `line`, if it matches. */
const captured = (pattern: RegExp, line: string | undefined): string | undefined =>
  pattern.exec(line ?? '')?.[1];

/** The pointer a text is, or `undefined` for any other text. */
export function readLfsPointer(text: string): LfsPointer | undefined {
  if (text.length > MAX_POINTER_BYTES) return undefined;
  const [version, oid, size, ...rest] = text.trimEnd().split('\n');
  const digest = captured(OID, oid);
  const bytes = captured(SIZE, size);
  const wellFormed = rest.length === 0 && VERSION.test(version ?? '');
  return wellFormed && digest !== undefined && bytes !== undefined
    ? { oid: digest, size: Number(bytes) }
    : undefined;
}

/** The warning for a plugin file that is a pointer: the plugin needs the real file and cannot get it. */
export const lfsPointerIssue = (path: string): PluginIssue =>
  warning(
    path,
    `${path} is a Git LFS pointer file, not the file itself: the clone never downloads LFS content. Keep plugin files out of Git LFS`,
  );
