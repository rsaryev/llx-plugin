import type { z } from 'zod';
import { blocksLoading, error, warning, type PluginIssue } from './issues.ts';
import {
  MANIFEST_SCHEMAS,
  isManifestKey,
  manifestSchema,
  userConfigOptionSchema,
  type PluginManifest,
} from './manifest-schema.ts';
import { nameLoadIssues } from './names.ts';
import { checkPluginManifest, manifestPathFindings } from './validate/plugin-manifest.ts';
import { isRecord } from '../protocol/is-record.ts';
import { USER_CONFIG_KEY } from './user-config-refs.ts';

/**
 * Reading `.claude-plugin/plugin.json` as Claude Code loads it (plugins/manifest-reference.md):
 * an unrecognized top-level key is stripped with a warning; a key of the wrong type, an unknown key
 * in a strict object, a bad path or an unusable name is an error, and a manifest with an error does
 * not load ("Validation failed … Claude Code reports the same problem when it loads the plugin").
 */
export interface ManifestResult {
  /** Undefined when an error keeps the plugin from loading. */
  readonly manifest: PluginManifest | undefined;
  readonly issues: readonly PluginIssue[];
}

/** Keys moved under `experimental` that still load at the top level ("Fields"). */
const MOVED = new Set(['themes', 'monitors']);

const describe = (failure: z.ZodError): string =>
  failure.issues.map((found) => found.message).join('; ') || 'invalid value';

/** `userConfig` reported per option, so the issue names the option at fault. */
function userConfigIssues(value: unknown): PluginIssue[] {
  if (!isRecord(value)) return [error('userConfig', 'Invalid "userConfig": expected an object')];
  return Object.entries(value).flatMap(([key, option]) => {
    const path = `userConfig.${key}`;
    if (!USER_CONFIG_KEY.test(key)) {
      return [error(path, `Invalid option key "${key}": letters, digits and underscores only`)];
    }
    const parsed = userConfigOptionSchema.safeParse(option);
    return parsed.success
      ? []
      : [error(path, `Invalid option "${key}": ${describe(parsed.error)}`)];
  });
}

function keyIssues(key: string, value: unknown): PluginIssue[] {
  if (!isManifestKey(key)) return [warning(key, `Unknown field "${key}"`)];
  const parsed = MANIFEST_SCHEMAS[key].safeParse(value);
  if (!parsed.success) {
    return key === 'userConfig'
      ? userConfigIssues(value)
      : [error(key, `Invalid "${key}": ${describe(parsed.error)}`)];
  }
  return MOVED.has(key) ? [warning(key, `"${key}" belongs under "experimental"`)] : [];
}

export function readManifest(raw: unknown): ManifestResult {
  if (!isRecord(raw)) {
    return {
      manifest: undefined,
      issues: [error('plugin.json', 'The manifest is not a JSON object')],
    };
  }
  const issues: PluginIssue[] = [];
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const found = keyIssues(key, value);
    issues.push(...found);
    if (isManifestKey(key) && !blocksLoading(found)) kept[key] = value;
  }
  if (typeof kept.name !== 'string') {
    if (!issues.some((found) => found.path === 'name')) {
      issues.push(error('name', 'The manifest has no "name"'));
    }
    return { manifest: undefined, issues };
  }
  issues.push(...nameLoadIssues(kept.name));
  // Every kept key passed its own schema, so the whole parses; this types it without a cast.
  const parsed = manifestSchema.safeParse(kept);
  if (blocksLoading(issues) || !parsed.success) return { manifest: undefined, issues };
  issues.push(...manifestPathFindings(kept));
  return { manifest: blocksLoading(issues) ? undefined : parsed.data, issues };
}

/**
 * `claude plugin validate` on a parsed `plugin.json`: the validator's findings and what the inline
 * `hooks` and `mcpServers` hold (`checkPluginManifest`, the one rule set).
 */
export function validateManifest(raw: unknown): PluginIssue[] {
  const { findings, inline } = checkPluginManifest(raw);
  return [...findings, ...inline];
}
