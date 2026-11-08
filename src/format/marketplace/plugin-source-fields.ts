import { error, type PluginIssue } from '../issues.ts';

/**
 * The field checks every object plugin source shares (plugins/marketplace-reference.md, "Plugin
 * sources" and "Invalid input on a source"): a known type "with a required field missing or of the
 * wrong type" is `Invalid input` on the entry's `source`.
 */

/** Where a source is being read: the path its issues name, and what bare names and `\` depend on. */
export interface SourceSite {
  readonly path: string;
  readonly pluginRoot?: string;
  readonly platform: 'posix' | 'windows';
}

export const invalidInput = (site: SourceSite): PluginIssue[] => [
  error(site.path, 'Invalid input'),
];

/** A full 40-character lowercase commit SHA ("Plugin sources": `sha`). */
const COMMIT_SHA = /^[0-9a-f]{40}$/;
/** The archive's digest: 64 hex characters, uppercase or lowercase ("archive plugin source"). */
const ARCHIVE_DIGEST = /^[0-9A-Fa-f]{64}$/;

/** What one text field of a source accepts. */
export interface FieldRule<Required extends boolean = boolean> {
  readonly required: Required;
  readonly accepts: (value: unknown) => boolean;
}

export const isText = (value: unknown): value is string =>
  typeof value === 'string' && value !== '';
const matching =
  (pattern: RegExp) =>
  (value: unknown): boolean =>
    typeof value === 'string' && pattern.test(value);

export const REQUIRED_TEXT: FieldRule<true> = { required: true, accepts: isText };
export const OPTIONAL_TEXT: FieldRule<false> = { required: false, accepts: isText };
export const OPTIONAL_SHA: FieldRule<false> = { required: false, accepts: matching(COMMIT_SHA) };
export const OPTIONAL_DIGEST: FieldRule<false> = {
  required: false,
  accepts: matching(ARCHIVE_DIGEST),
};

/** The values `readFields` returns: a required field is a string, an optional one may be absent. */
export type FieldValues<Rules extends Readonly<Record<string, FieldRule>>> = {
  readonly [K in keyof Rules]: Rules[K] extends FieldRule<true> ? string : string | undefined;
};

/** Each rule applied to `raw`; the values, or `undefined` when a required one is missing or any is invalid. */
export function readFields<Rules extends Readonly<Record<string, FieldRule>>>(
  raw: Readonly<Record<string, unknown>>,
  rules: Rules,
): FieldValues<Rules> | undefined {
  const values: Record<string, string> = {};
  for (const [field, rule] of Object.entries(rules)) {
    const value = raw[field];
    if (value === undefined) {
      if (rule.required) return undefined;
      continue;
    }
    if (!rule.accepts(value) || typeof value !== 'string') return undefined;
    values[field] = value;
  }
  // Every required key was checked above and an absent optional one reads as `undefined`, so the
  // collected record has exactly the shape `FieldValues` promises; TypeScript cannot follow the loop.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see the comment above: the shape is proven by the loop
  return values as FieldValues<Rules>;
}
