/**
 * The two errors Claude Code gives for a marketplace source it parses and cannot load
 * (marketplace-reference.md, the `npm` row of "Marketplace sources" and "Source values valid only in
 * policy lists"), defined once for the load status, the notice and the fetch plan.
 */
export const SOURCE_FAILURE = {
  npm: 'NPM marketplace sources not yet implemented',
  policyOnly: 'Unsupported marketplace source type',
} as const;

/** The notice for a type only a policy list takes, outside one. */
export const policyOnlyNotice = (kind: string): string =>
  `A ${kind} source is valid only in strictKnownMarketplaces and blockedMarketplaces; elsewhere it fails to load: ${SOURCE_FAILURE.policyOnly}`;
