/** Helpers for the marketplace gate tests: source objects and a gate over managed settings. */
import type { SdkMarketplaceSource } from '../../src/protocol/official.ts';
import {
  createMarketplaceGate,
  matchMarketplaceSource,
  type MarketplaceGate,
} from '../../src/settings/marketplaces/index.ts';
import { viewOf, type Source } from './plugin-settings.ts';

export const github = (
  repo: string,
  extra: { ref?: string; path?: string } = {},
): SdkMarketplaceSource => ({
  source: 'github',
  repo,
  ...extra,
});

export const git = (
  url: string,
  extra: { ref?: string; path?: string } = {},
): SdkMarketplaceSource => ({
  source: 'git',
  url,
  ...extra,
});

export const url = (address: string): SdkMarketplaceSource => ({ source: 'url', url: address });
export const file = (path: string): SdkMarketplaceSource => ({ source: 'file', path });
export const directory = (path: string): SdkMarketplaceSource => ({ source: 'directory', path });
export const hostPattern = (pattern: string): SdkMarketplaceSource => ({
  source: 'hostPattern',
  hostPattern: pattern,
});
export const pathPattern = (pattern: string): SdkMarketplaceSource => ({
  source: 'pathPattern',
  pathPattern: pattern,
});
export const skillsDir: SdkMarketplaceSource = { source: 'skills-dir' };

/** The official marketplace, as the docs spell it ("Allow only the official marketplace"). */
export const official = github('anthropics/claude-plugins-official');

/** A gate over the given sources of settings. */
export const gateOf = (...sources: readonly Source[]): MarketplaceGate =>
  createMarketplaceGate(viewOf(...sources));

/** A gate whose managed settings hold the given keys. */
export const managed = (settings: Readonly<Record<string, unknown>>): MarketplaceGate =>
  gateOf(['managed', settings]);

/** Whether an allowlist entry admits the source of a marketplace. */
export const admits = (entry: SdkMarketplaceSource, source: SdkMarketplaceSource): boolean =>
  matchMarketplaceSource('strict', entry, source);

/** Whether a blocklist entry blocks the source of a marketplace. */
export const blocks = (entry: SdkMarketplaceSource, source: SdkMarketplaceSource): boolean =>
  matchMarketplaceSource('blocked', entry, source);
