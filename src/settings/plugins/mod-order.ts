import type { PolicyKey } from '../../protocol/settings-keys.ts';
import type { PolicyView } from '../view.ts';
import { forceEnabledByManaged } from './enabled-plugins.ts';
import { guardIdForms, isGuardPluginId, parsePluginId, spellingsOf } from './plugin-id.ts';

/** How the session signs in; the host knows it, the kit never does (settings-reference.md, `prependPlugins`). */
export type PolicyAccount = 'claudeaiTeamEnterprise' | 'claudeaiPersonal' | 'console';

/** The two machine facts the ordering keys depend on. */
export interface ModOrderContext {
  /** Any admin-controlled source of settings is present on the machine. */
  readonly hasManagedSettings: boolean;
  /** `claudeaiTeamEnterprise` only for a Team or Enterprise `/login`, not for a long-lived token. */
  readonly account: PolicyAccount;
}

export interface SkippedPolicyMod {
  readonly id: string;
  readonly reason: string;
}

/** Where the built-in guard sits: at the position a managed list gives it, outermost by default, or not loaded. */
export type GuardPlacement = 'listed' | 'outermost' | 'absent';

export interface ModOrderResult {
  /** Run before every mod a user installs, in this order. The built-in guard is here when listed. */
  readonly prepend: readonly string[];
  /** Run after every mod a user installs, in this order. */
  readonly append: readonly string[];
  /**
   * The organization's mods that no list names: they run right after `prepend` and before every
   * mod a user installs, in the order `orgMods` holds them (plugins/mods/events.md, "The order mods
   * run in").
   */
  readonly unlisted: readonly string[];
  readonly skipped: readonly SkippedPolicyMod[];
  readonly guard: { readonly loads: boolean; readonly placement: GuardPlacement };
}

type OrderKey = Extract<PolicyKey, 'prependPlugins' | 'appendPlugins'>;
type ListOrigin = 'managed' | 'user';

/** What every id of one list is judged against. */
interface Request {
  readonly view: PolicyView;
  readonly key: OrderKey;
  readonly orgMods: ReadonlySet<string>;
}

interface Listing {
  readonly from: ListOrigin;
  readonly ids: readonly string[];
}

/** The text of the line Claude Code's debug log writes when a managed list names a plugin it skips. */
const notManagedMod = (key: OrderKey, id: string): string =>
  `${key} names ${id}, which is not an enabled managed plugin with a hooks module; skipped`;

/**
 * The list a key holds once the source rule is applied: managed settings always; user settings only
 * on a machine with no managed settings and no Team or Enterprise `/login`; project, local and
 * `--settings` never (the key's scope line already drops those).
 */
function listingOf(view: PolicyView, key: OrderKey, userMayOrder: boolean): Listing | undefined {
  const holder = view
    .eachFromHighest(key)
    .find((each) => each.scope === 'managed' || (each.scope === 'user' && userMayOrder));
  if (holder === undefined) return undefined;
  return { from: holder.scope === 'managed' ? 'managed' : 'user', ids: holder.value };
}

/** The id with the guard's two spellings made one, so a repeat of either is a repeat. */
const canonical = (id: string): string => spellingsOf([guardIdForms], id)[0] ?? id;

/** Why an id of a managed list is skipped, or `undefined` when it takes effect. */
function managedSkip(request: Request, id: string): string | undefined {
  const { view, key, orgMods } = request;
  if (key === 'prependPlugins' && isGuardPluginId(id)) return undefined;
  return forceEnabledByManaged(view, id) && orgMods.has(id) ? undefined : notManagedMod(key, id);
}

/** The ids of one list that take effect, in the listed order, each once, and those that do not. */
function accept(
  request: Request,
  listing: Listing | undefined,
): { taken: string[]; skipped: SkippedPolicyMod[] } {
  const taken: string[] = [];
  const skipped: SkippedPolicyMod[] = [];
  const seen = new Set<string>();
  for (const id of listing?.ids ?? []) {
    if (seen.has(canonical(id))) continue;
    seen.add(canonical(id));
    const reason = skipReason(request, listing?.from ?? 'user', id);
    if (reason === undefined) taken.push(id);
    else skipped.push({ id, reason });
  }
  return { taken, skipped };
}

function skipReason(request: Request, from: ListOrigin, id: string): string | undefined {
  const { key } = request;
  if (parsePluginId(id) === undefined) {
    return `${key} names ${id}, which is not a plugin-name@marketplace-name id; skipped`;
  }
  if (from === 'managed') return managedSkip(request, id);
  // A user's list orders the user's own mods; it neither adds nor removes the built-in guard.
  return isGuardPluginId(id)
    ? `${key} cannot add the built-in guard from user settings; skipped`
    : undefined;
}

/**
 * The order the organization's and the user's own mods run in (settings-reference.md,
 * `prependPlugins` and `appendPlugins`; plugins/mods/admin.md, "Install your organization's mods and
 * set the order"). `orgMods` holds the plugins the host has checked to meet the two conditions
 * the settings cannot show: the marketplace is a directory on the machine and lists the plugin by a
 * relative path, so it loads in place. The kit adds the third, a managed `enabledPlugins` `true`.
 *
 * Judgment (spec/judgments.md): the organization's mods that no list names are `unlisted`, in the
 * order of `orgMods`, a repeated id keeps its first place, the two spellings of the guard
 * are one id, text that is no plugin id and a guard in a user list are skipped with a reason, and a
 * managed layer counts as managed settings whatever the host says.
 */
export function modOrder(
  view: PolicyView,
  context: ModOrderContext,
  orgMods: ReadonlySet<string>,
): ModOrderResult {
  const hasManaged = context.hasManagedSettings || view.layers.some((l) => l.scope === 'managed');
  const teamLogin = context.account === 'claudeaiTeamEnterprise';
  const userMayOrder = !hasManaged && !teamLogin;

  const prependListing = listingOf(view, 'prependPlugins', userMayOrder);
  const prepend = accept({ view, key: 'prependPlugins', orgMods }, prependListing);
  const append = accept(
    { view, key: 'appendPlugins', orgMods },
    listingOf(view, 'appendPlugins', userMayOrder),
  );
  // "An id listed in both `prependPlugins` and `appendPlugins` is prepended."
  const prepended = new Set(prepend.taken.map(canonical));
  const appended = append.taken.filter((id) => !prepended.has(canonical(id)));
  const listed = new Set([...prepended, ...appended]);
  return {
    prepend: prepend.taken,
    append: appended,
    // "A mod that counts as yours runs before users' mods even when you list it nowhere."
    unlisted: [...orgMods].filter(
      (id) => forceEnabledByManaged(view, id) && !listed.has(canonical(id)),
    ),
    skipped: [...prepend.skipped, ...append.skipped],
    guard: guardOf(prependListing, prepend.taken, hasManaged || teamLogin),
  };
}

/**
 * "If managed `prependPlugins` is set, the guard loads only when that list names it, at the position
 * listed"; otherwise it loads on a machine with managed settings or a Team or Enterprise `/login`,
 * outermost (plugins/mods/reference.md; admin.md, "Know what happens by default").
 */
function guardOf(
  prependListing: Listing | undefined,
  prepended: readonly string[],
  loadsByDefault: boolean,
): ModOrderResult['guard'] {
  if (prependListing?.from === 'managed') {
    return prepended.some(isGuardPluginId)
      ? { loads: true, placement: 'listed' }
      : { loads: false, placement: 'absent' };
  }
  return loadsByDefault
    ? { loads: true, placement: 'outermost' }
    : { loads: false, placement: 'absent' };
}
