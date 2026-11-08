import { isWritableScope, type InstallScope } from '../marketplace/install-scopes.ts';
import {
  marketplaceFailure,
  marketplaceSuccess,
  noResultLine,
  type CommandOutput,
} from './result.ts';
import { RESERVED_QUIET_NAME } from './marketplace-add.ts';
import { chooseScope, type ConfigScope } from './scope.ts';

/**
 * `claude plugin marketplace remove <name>` as a plan (plugins/cli-reference.md, "plugin marketplace
 * remove"): which settings files lose the declaration and, when the last one does, the cache, the
 * plugins installed from it and their options, secrets and data. Pure over what the host read; the
 * host deletes. `--scope` has no `-s`. The wording for a marketplace nobody knows and for one plugin,
 * and what a plugin only managed settings installed does, are in spec/judgments.md.
 */

export interface RemoveArguments {
  /** The marketplace name `plugin marketplace list` shows, not the source passed to `add`. */
  readonly name: string;
  readonly scope?: string;
  readonly json?: boolean;
}

/** A plugin installed from the marketplace and the scopes it is installed at. */
export interface InstalledFromMarketplace {
  /** `name@marketplace`. */
  readonly id: string;
  readonly scopes: readonly InstallScope[];
}

export interface RemoveFacts {
  /** The marketplace is registered (on disk or declared). */
  readonly known: boolean;
  /** The settings files that declare it. */
  readonly declaredIn: readonly ConfigScope[];
  readonly plugins: readonly InstalledFromMarketplace[];
}

/**
 * One plugin uninstalled because its marketplace is gone: "Also deletes their saved options and
 * secrets and data where it can". The flags are the docs' three deletions, every one on because the
 * plugin leaves its last scope; `--keep-data` and the cases that keep the data directory belong to
 * `plugin uninstall`.
 */
export interface PluginRemoval {
  readonly id: string;
  /** The scopes to uninstall from: every scope but `managed`, which the user cannot change. */
  readonly scopes: readonly InstallScope[];
  readonly deleteOptions: true;
  readonly deleteSecrets: true;
  readonly deleteData: true;
}

export interface RemovePlan {
  readonly output: CommandOutput;
  /** The settings files to remove the declaration from. */
  readonly removeFrom: readonly ConfigScope[];
  /** The marketplace was removed from the last scope that declares it. */
  readonly deleteCache: boolean;
  readonly uninstall: readonly PluginRemoval[];
}

const removal = (plugin: InstalledFromMarketplace): PluginRemoval => ({
  id: plugin.id,
  scopes: plugin.scopes.filter(isWritableScope),
  deleteOptions: true,
  deleteSecrets: true,
  deleteData: true,
});

const nothing = (output: CommandOutput): RemovePlan => ({
  output,
  removeFrom: [],
  deleteCache: false,
  uninstall: [],
});

function lineOf(name: string, uninstalled: readonly PluginRemoval[]): string {
  const head = `Successfully removed marketplace: ${name}`;
  if (uninstalled.length === 0) return head;
  const noun = uninstalled.length === 1 ? 'plugin' : 'plugins';
  return [
    head,
    `Also uninstalled ${uninstalled.length} ${noun} from this marketplace:`,
    ...uninstalled.map((one) => `  ${one.id}`),
  ].join('\n');
}

/** The declarations that go: the one `--scope` names, or every one without it. */
const declarationsToRemove = (
  chosen: ReturnType<typeof chooseScope>,
  facts: RemoveFacts,
): readonly ConfigScope[] =>
  'scope' in chosen
    ? facts.declaredIn.filter((declared) => declared === chosen.scope)
    : facts.declaredIn;

/** What `plugin marketplace remove` does and prints. */
export function planMarketplaceRemove(args: RemoveArguments, facts: RemoveFacts): RemovePlan {
  if (args.name === RESERVED_QUIET_NAME) {
    return nothing(noResultLine(`"${RESERVED_QUIET_NAME}" is a reserved marketplace name`));
  }
  const chosen = chooseScope('marketplace-remove', args.scope);
  if ('reason' in chosen) return nothing(chosen);
  if (!facts.known) {
    return nothing(
      marketplaceFailure(
        'marketplace-remove',
        args.name,
        `Marketplace '${args.name}' not found`,
        'not_found',
      ),
    );
  }
  const removeFrom = declarationsToRemove(chosen, facts);
  if ('scope' in chosen && removeFrom.length === 0) {
    return nothing(
      marketplaceFailure(
        'marketplace-remove',
        args.name,
        `Marketplace '${args.name}' is not declared in ${chosen.scope} settings. Omit --scope to remove it from all scopes.`,
        'not_declared_in_scope',
      ),
    );
  }
  const last = facts.declaredIn.every((scope) => removeFrom.includes(scope));
  const uninstall = last ? facts.plugins.map(removal).filter((one) => one.scopes.length > 0) : [];
  return {
    output: marketplaceSuccess('marketplace-remove', args.name, lineOf(args.name, uninstall)),
    removeFrom,
    deleteCache: last,
    uninstall,
  };
}
