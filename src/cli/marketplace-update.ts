import { planUpdate } from '../updates/update-targets.ts';
import {
  marketplaceFailure,
  marketplaceSuccess,
  usageError,
  type CommandOutput,
} from './result.ts';

/**
 * `claude plugin marketplace update [name]` as a plan (plugins/cli-reference.md, "plugin marketplace
 * update"; plugins/install.md, "Update plugins now"; plugins/troubleshooting.md, "Marketplace is
 * seed-managed"): which marketplaces' listings are refreshed, from what, and what is printed. It
 * refreshes listings only (`planUpdate`'s `marketplace-listing`): installed plugins keep their
 * versions. Pure; the host fetches.
 */

export interface UpdateArguments {
  /** Absent: every marketplace. */
  readonly name?: string;
  readonly json?: boolean;
}

export interface RegisteredForUpdate {
  readonly name: string;
  /** The branch or tag it was added with. */
  readonly ref?: string;
  /** `CLAUDE_CODE_PLUGIN_SEED_DIR` supplied it: the directory; it is read-only. */
  readonly seeded?: string;
}

export interface UpdateFacts {
  readonly registered: readonly RegisteredForUpdate[];
}

export interface RefreshTarget {
  readonly name: string;
  /** "Updates to the latest commit of that ref, not the repository's default branch." */
  readonly ref?: string;
}

export interface MarketplaceUpdatePlan {
  readonly output: CommandOutput;
  readonly refresh: readonly RefreshTarget[];
  /** Plugin ids updated: always none, "leaves your installed plugins at their current versions". */
  readonly update: readonly string[];
}

const nothing = (output: CommandOutput): MarketplaceUpdatePlan => ({
  output,
  refresh: [],
  update: [],
});

const targetOf = (marketplace: RegisteredForUpdate): RefreshTarget => ({
  name: marketplace.name,
  ...(marketplace.ref === undefined ? {} : { ref: marketplace.ref }),
});

const countLine = (count: number): string =>
  `Successfully updated ${count} ${count === 1 ? 'marketplace' : 'marketplaces'}`;

function named(name: string, found: RegisteredForUpdate | undefined): MarketplaceUpdatePlan {
  if (found === undefined) {
    return nothing(
      marketplaceFailure(
        'marketplace-update',
        name,
        `Marketplace '${name}' not found`,
        'not_found',
      ),
    );
  }
  if (found.seeded !== undefined) {
    return nothing(
      marketplaceFailure(
        'marketplace-update',
        name,
        `Marketplace '${name}' is seed-managed (${found.seeded}). Ask your administrator to update the seed directory`,
        'seed_managed',
      ),
    );
  }
  return {
    output: marketplaceSuccess(
      'marketplace-update',
      name,
      `Successfully updated marketplace: ${name}`,
    ),
    refresh: [targetOf(found)],
    update: [],
  };
}

/** What `plugin marketplace update` refreshes and prints. */
export function planMarketplaceUpdate(
  args: UpdateArguments,
  facts: UpdateFacts,
): MarketplaceUpdatePlan {
  if (args.name !== undefined) {
    return named(
      args.name,
      facts.registered.find((marketplace) => marketplace.name === args.name),
    );
  }
  if (args.json === true) {
    return nothing(usageError('--json needs a marketplace name: pass the marketplace to update'));
  }
  const listed = planUpdate(
    { kind: 'marketplace-listing' },
    [],
    facts.registered
      .filter((marketplace) => marketplace.seeded === undefined)
      .map((one) => one.name),
  );
  const refresh = facts.registered
    .filter((marketplace) => listed.refresh.includes(marketplace.name))
    .map(targetOf);
  return {
    output: marketplaceSuccess('marketplace-update', undefined, countLine(refresh.length)),
    refresh,
    update: listed.update,
  };
}
