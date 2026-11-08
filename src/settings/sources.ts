import type { PluginIssue } from '../format/issues.ts';
import { brokenSource, stopsStartup } from './broken-file.ts';
import { POLICY_SCOPES, type PolicyScope, type PolicyLayer } from './layers.ts';
import { readSettingsLayer } from './read-layer.ts';
import { isRecord } from './record.ts';

/**
 * Where a host's settings come from. The kit knows no file path, MDM profile, registry value or
 * server-managed fetch: the host reads each source it has and hands over its raw JSON, either
 * parsed or as text. Choosing among managed sources (`managedSourcesBehavior`, `policyHelper`) is
 * the host's, not the kit's. Optional: a host may build layers with `readSettingsLayer` itself.
 */
export interface SettingsSources {
  /** The source's JSON (an object, or its text); `undefined` when the source does not exist. */
  read(scope: PolicyScope, signal: AbortSignal): Promise<unknown>;
  /**
   * What names the source in a report: the file's path, `per-user managed preferences`,
   * `Registry: HKLM\SOFTWARE\Policies\ClaudeCode\Settings` (errors.md, "Managed settings document
   * could not be parsed"). Without it a report names no source.
   */
  label?(scope: PolicyScope): string | undefined;
}

type Parsed = { readonly value: unknown } | { readonly issue: PluginIssue };

function parseSource(scope: PolicyScope, raw: unknown, source: string | undefined): Parsed {
  if (typeof raw !== 'string') return { value: raw };
  // An empty `managed-settings.json` counts as `{}` (errors.md).
  if (raw.trim() === '') return { value: {} };
  try {
    return { value: JSON.parse(raw) };
  } catch (failure) {
    const why = failure instanceof Error ? failure.message : 'invalid JSON';
    return { issue: brokenSource(scope, why, source) };
  }
}

/** What loading every source came to. */
export interface LoadedSettings {
  /** The sources that exist and could be read, highest first; none when `fatal`. */
  readonly layers: readonly PolicyLayer[];
  readonly issues: readonly PluginIssue[];
  /**
   * A managed document that is present and does not parse as a JSON object: Claude Code "exits with
   * code 1 at startup instead of running without the policy the document carries" (errors.md). The
   * host stops and reports `issues`; no layer is returned, so none runs without the policy.
   */
  readonly fatal: boolean;
}

/**
 * Reads every scope the host has, in precedence order, into layers. A broken user, project, local or
 * `--settings` source is skipped; a broken managed one is `fatal`.
 */
export async function loadSettingsLayers(
  sources: SettingsSources,
  signal: AbortSignal,
  scopes: readonly PolicyScope[] = POLICY_SCOPES,
): Promise<LoadedSettings> {
  const raws = await Promise.all(scopes.map((scope) => sources.read(scope, signal)));
  const layers: PolicyLayer[] = [];
  const issues: PluginIssue[] = [];
  let fatal = false;
  scopes.forEach((scope, index) => {
    const raw = raws[index];
    if (raw === undefined) return;
    const source = sources.label?.(scope);
    const parsed = parseSource(scope, raw, source);
    if ('issue' in parsed || !isRecord(parsed.value)) {
      const issue = 'issue' in parsed ? parsed.issue : brokenSource(scope, undefined, source);
      issues.push(issue);
      fatal ||= stopsStartup(scope);
      return;
    }
    const read = readSettingsLayer(scope, parsed.value, source);
    layers.push(read.layer);
    issues.push(...read.issues);
  });
  return { layers: fatal ? [] : layers, issues, fatal };
}
