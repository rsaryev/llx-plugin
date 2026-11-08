/**
 * "Update plugins now" (plugins/install.md): what each way of updating touches. Pure: the host
 * refreshes listings and updates plugins; the kit says which, and which it leaves to the user.
 * "There's no command that updates every plugin at once", so no request here asks for that.
 */

/** A plugin the user installed, with what decides whether a bulk update may touch it. */
export interface InstalledForUpdate {
  /** `name@marketplace`. */
  readonly id: string;
  readonly marketplace: string;
  /** Its marketplace entry has a `command` source. */
  readonly commandSource?: boolean;
  /** Its marketplace entry sets a `headersHelper` command. */
  readonly headersHelper?: string;
}

export type UpdateRequest =
  /** `Update now` on the Installed tab, or `claude plugin update <plugin>@<marketplace>`. */
  | { readonly kind: 'plugin'; readonly id: string }
  /** `Update marketplace` on the Marketplaces tab. */
  | { readonly kind: 'marketplace-tab'; readonly marketplace: string }
  /** `claude plugin marketplace update [name]`, and the in-session command that opens the tab: the listing only. */
  | { readonly kind: 'marketplace-listing'; readonly marketplace?: string };

export type LeftReason = 'command-source' | 'headers-helper';

export interface LeftToUser {
  readonly id: string;
  readonly reason: LeftReason;
  /** "you update it from its view on the Installed tab or with `claude plugin update <plugin>@<marketplace>`". */
  readonly instruction: string;
}

export interface UpdatePlan {
  /** Marketplaces whose listing is refreshed. */
  readonly refresh: readonly string[];
  /** Plugin ids updated. */
  readonly update: readonly string[];
  /** Plugins a bulk update left for the user to update themselves. */
  readonly leftToUser: readonly LeftToUser[];
}

/** A bulk update does not touch a `command` source or a `headersHelper` entry: both need the user's acceptance. */
const leftReason = (plugin: InstalledForUpdate): LeftReason | undefined => {
  if (plugin.headersHelper !== undefined) return 'headers-helper';
  return plugin.commandSource === true ? 'command-source' : undefined;
};

const isRegistered = (name: string, registered: readonly string[]): boolean =>
  registered.includes(name);

/** The listing of `marketplace`, then the plugins installed from it, less the ones left to the user. */
function marketplaceTab(
  marketplace: string,
  installed: readonly InstalledForUpdate[],
  registered: readonly string[],
): UpdatePlan {
  if (!isRegistered(marketplace, registered)) return { refresh: [], update: [], leftToUser: [] };
  const mine = installed.filter((plugin) => plugin.marketplace === marketplace);
  const left = mine.flatMap((plugin) => {
    const reason = leftReason(plugin);
    return reason === undefined
      ? []
      : [{ id: plugin.id, reason, instruction: `claude plugin update ${plugin.id}` }];
  });
  return {
    refresh: [marketplace],
    update: mine.filter((plugin) => leftReason(plugin) === undefined).map((plugin) => plugin.id),
    leftToUser: left,
  };
}

/** "It refreshes every marketplace's listing but leaves your installed plugins at their current versions." */
function listingOnly(marketplace: string | undefined, registered: readonly string[]): UpdatePlan {
  const refresh =
    marketplace === undefined ? registered : registered.filter((name) => name === marketplace);
  return { refresh, update: [], leftToUser: [] };
}

type Kind = UpdateRequest['kind'];
type Handler<K extends Kind> = (
  request: Extract<UpdateRequest, { kind: K }>,
  installed: readonly InstalledForUpdate[],
  registered: readonly string[],
) => UpdatePlan;

const HANDLERS: { readonly [K in Kind]: Handler<K> } = {
  plugin: (request, installed) => ({
    refresh: [],
    update: installed.some((plugin) => plugin.id === request.id) ? [request.id] : [],
    leftToUser: [],
  }),
  'marketplace-tab': (request, installed, registered) =>
    marketplaceTab(request.marketplace, installed, registered),
  'marketplace-listing': (request, _installed, registered) =>
    listingOnly(request.marketplace, registered),
};

function handle<K extends Kind>(
  request: Extract<UpdateRequest, { kind: K }>,
  installed: readonly InstalledForUpdate[],
  registered: readonly string[],
): UpdatePlan {
  return HANDLERS[request.kind](request, installed, registered);
}

/**
 * What `request` does. Judgments (spec/judgments.md): a single-plugin update names no marketplace
 * refresh; a plugin that is not installed has nothing to update; a marketplace that is not
 * registered has nothing to refresh; a plugin with both a
 * `headersHelper` and a `command` source is reported as a `headersHelper` one.
 */
export const planUpdate = (
  request: UpdateRequest,
  installed: readonly InstalledForUpdate[],
  registered: readonly string[],
): UpdatePlan => handle(request, installed, registered);
