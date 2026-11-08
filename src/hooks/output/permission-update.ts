import { z } from 'zod';
import { error, type PluginIssue } from '../../format/issues.ts';
import { normalizePermissionMode, PERMISSION_BEHAVIORS } from '../../protocol/permission-modes.ts';
import type { PermissionUpdate } from '../../protocol/official.ts';
import { optional } from '../input/facts-shared.ts';

/**
 * Permission update entries (hooks.md, "Permission update entries"): the array `updatedPermissions`
 * returns and `permission_suggestions` carries, six entry types, each with a `destination`. The
 * kit validates and normalizes them; writing them to a settings file is the host's.
 */

/**
 * "`session`, `localSettings`, `projectSettings`, `userSettings`". Judgment (spec/judgments.md):
 * the official type also has `cliArg`, which a suggestion can carry and a hook may echo back, so
 * the entry is accepted.
 */
const destination = z.enum([
  'session',
  'localSettings',
  'projectSettings',
  'userSettings',
  'cliArg',
]);

/** "`rules` is an array of `{toolName, ruleContent?}` objects. Omit `ruleContent` to match the whole tool." */
const rule = z.object({ toolName: z.string(), ruleContent: optional(z.string()) });
const rules = z.array(rule);
const behavior = z.enum(PERMISSION_BEHAVIORS);
const directories = z.array(z.string());

/** "`manual` as an alias for `default`": the entry carries the mode Claude Code names. */
const mode = z.string().transform((raw, context) => {
  const named = normalizePermissionMode(raw);
  if (named !== undefined) return named;
  context.addIssue({ code: 'custom', message: `"${raw}" is not a permission mode` });
  return z.NEVER;
});

const ruleEntry = <T extends 'addRules' | 'replaceRules' | 'removeRules'>(type: T) =>
  z.object({ type: z.literal(type), rules, behavior, destination });

export const permissionUpdateSchema = z.discriminatedUnion('type', [
  ruleEntry('addRules'),
  ruleEntry('replaceRules'),
  ruleEntry('removeRules'),
  z.object({ type: z.literal('setMode'), mode, destination }),
  z.object({ type: z.literal('addDirectories'), directories, destination }),
  z.object({ type: z.literal('removeDirectories'), directories, destination }),
]) satisfies z.ZodType<PermissionUpdate>;

export interface ParsedPermissionUpdates {
  readonly updates: readonly PermissionUpdate[];
  /** One error per entry that is not a valid permission update, `permissionUpdates[i].<field>`. */
  readonly issues: readonly PluginIssue[];
}

const pathOf = (index: number, segments: readonly PropertyKey[]): string =>
  segments.reduce<string>(
    (path, segment) => `${path}.${String(segment)}`,
    `permissionUpdates[${index}]`,
  );

/** The valid entries of `raw` and an issue for each that is not: an entry never takes its neighbours down. */
export function parsePermissionUpdates(raw: unknown): ParsedPermissionUpdates {
  if (!Array.isArray(raw)) {
    return { updates: [], issues: [error('permissionUpdates', 'Expected an array of entries')] };
  }
  const updates: PermissionUpdate[] = [];
  const issues: PluginIssue[] = [];
  raw.forEach((entry: unknown, index) => {
    const parsed = permissionUpdateSchema.safeParse(entry);
    if (parsed.success) updates.push(parsed.data);
    else {
      issues.push(
        ...parsed.error.issues.map((found) => error(pathOf(index, found.path), found.message)),
      );
    }
  });
  return { updates, issues };
}
