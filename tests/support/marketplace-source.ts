import type { PluginIssue } from '../../src/format/issues.ts';
import { parseMarketplaceSource } from '../../src/format/marketplace/marketplace-source.ts';
import type { MarketplaceSource } from '../../src/format/marketplace/types.ts';

/** Shorthands for the marketplace source parser's tests. */
export const parse = (raw: unknown, policy = false, key?: string) =>
  parseMarketplaceSource(raw, { policy, ...(key === undefined ? {} : { key }) });
export const errors = (issues: readonly PluginIssue[]) =>
  issues.filter((i) => i.severity === 'error');
export const warnings = (issues: readonly PluginIssue[]) =>
  issues.filter((i) => i.severity === 'warning');
export const sourceOf = (raw: unknown, policy = false): MarketplaceSource => {
  const result = parse(raw, policy);
  if (result.source === undefined) throw new Error(JSON.stringify(result.issues));
  return result.source;
};
export const DEFAULT_PATH = '.claude-plugin/marketplace.json';
