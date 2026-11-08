/** Helpers for the marketplace gate tests: source objects and a gate over managed settings. */
import type { MarketplaceSource } from '../../src/protocol/official.ts';
import {
  createMarketplaceGate,
  matchMarketplaceSource,
  type MarketplaceGate,
} from '../../src/settings/marketplaces/index.ts';
import { viewOf, type Source } from './plugin-settings.ts';

export const github = (
  repo: string,
  extra: { ref?: string; path?: string } = {},
): MarketplaceSource => ({
  source: 'github',
  repo,
  ...extra,
});

export const git = (
  url: string,
  extra: { ref?: string; path?: string } = {},
): MarketplaceSource => ({
  source: 'git',
  url,
  ...extra,
});

export const url = (address: string): MarketplaceSource => ({ source: 'url', url: address });
export const file = (path: string): MarketplaceSource => ({ source: 'file', path });
export const directory = (path: string): MarketplaceSource => ({ source: 'directory', path });
export const hostPattern = (pattern: string): MarketplaceSource => ({
  source: 'hostPattern',
  hostPattern: pattern,
});
export const pathPattern = (pattern: string): MarketplaceSource => ({
  source: 'pathPattern',
  pathPattern: pattern,
});
export const skillsDir: MarketplaceSource = { source: 'skills-dir' };

/** The official marketplace, as the docs spell it ("Allow only the official marketplace"). */
export const official = github('anthropics/claude-plugins-official');

/** A gate over the given sources of settings. */
export const gateOf = (...sources: readonly Source[]): MarketplaceGate =>
  createMarketplaceGate(viewOf(...sources));

/** A gate whose managed settings hold the given keys. */
export const managed = (settings: Readonly<Record<string, unknown>>): MarketplaceGate =>
  gateOf(['managed', settings]);

/** Whether an allowlist entry admits the source of a marketplace. */
export const admits = (entry: MarketplaceSource, source: MarketplaceSource): boolean =>
  matchMarketplaceSource('strict', entry, source);

/** Whether a blocklist entry blocks the source of a marketplace. */
export const blocks = (entry: MarketplaceSource, source: MarketplaceSource): boolean =>
  matchMarketplaceSource('blocked', entry, source);
