import { error, warning, type PluginIssue } from '../format/issues.ts';
import { POLICY_SCOPES, type PolicyScope, type SettingsLayer } from './layers.ts';
import { readSettingsLayer } from './read-layer.ts';

/**
 * Where a host's settings come from. The kit knows no file path, MDM profile, registry value or
 * server-managed fetch: the host reads each source it has and hands over its raw JSON, either
 * parsed or as text. Choosing among managed sources (`managedSourcesBehavior`, `policyHelper`) is
 * the host's, not the kit's. Optional: a host may build layers with `readSettingsLayer` itself.
 */
export interface SettingsSources {
  /** The source's JSON (an object, or its text); `undefined` when the source does not exist. */
  read(scope: PolicyScope, signal: AbortSignal): Promise<unknown>;
}

/** A source that is present but whose text is not JSON (managed: errors.md, "could not be parsed"). */
const unparsable = (scope: PolicyScope, reason: string): PluginIssue =>
  scope === 'managed' || scope === 'parent'
    ? error(
        `${scope}:`,
        `Managed settings document could not be parsed as a JSON object; none of its settings are in effect. Fix or remove it. (${reason})`,
      )
    : warning(`${scope}:`, `The settings could not be parsed and are skipped (${reason})`);

function parseText(scope: PolicyScope, text: string): { value?: unknown; issue?: PluginIssue } {
  // An empty `managed-settings.json` counts as `{}` (errors.md).
  if (text.trim() === '') return { value: {} };
  try {
    return { value: JSON.parse(text) };
  } catch (failure) {
    return {
      issue: unparsable(scope, failure instanceof Error ? failure.message : 'invalid JSON'),
    };
  }
}

/** Reads every scope the host has, in precedence order, into layers; a broken source is skipped. */
export async function loadSettingsLayers(
  sources: SettingsSources,
  signal: AbortSignal,
  scopes: readonly PolicyScope[] = POLICY_SCOPES,
): Promise<{ layers: readonly SettingsLayer[]; issues: readonly PluginIssue[] }> {
  const raws = await Promise.all(scopes.map((scope) => sources.read(scope, signal)));
  const layers: SettingsLayer[] = [];
  const issues: PluginIssue[] = [];
  scopes.forEach((scope, index) => {
    const raw = raws[index];
    if (raw === undefined) return;
    const parsed = typeof raw === 'string' ? parseText(scope, raw) : { value: raw };
    if (parsed.issue !== undefined) {
      issues.push(parsed.issue);
      return;
    }
    const read = readSettingsLayer(scope, parsed.value);
    layers.push(read.layer);
    issues.push(...read.issues);
  });
  return { layers, issues };
}
