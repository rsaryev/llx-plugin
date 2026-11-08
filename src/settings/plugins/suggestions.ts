/**
 * `pluginSuggestionMarketplaces`: the marketplaces whose plugins may surface as contextual install
 * suggestions (settings-reference.md, `pluginSuggestionMarketplaces`; plugins/relevance.md, "Enable
 * suggestions in managed settings"). The suggestions themselves come from each plugin's `relevance`
 * and render in the host's spinner tips and Discover tab; the kit decides which names take effect.
 */
import type { SdkMarketplaceSource } from '../../protocol/official.ts';
import { matchMarketplaceSource } from '../marketplaces/match-source.ts';
import { OFFICIAL_MARKETPLACE } from '../marketplaces/registry.ts';
import { registrationProblems } from '../marketplaces/source-validate.ts';
import type { PolicyView } from '../view.ts';

/** The marketplaces registered on the machine: name to the source each was registered from. */
export type RegisteredMarketplaces = Readonly<Record<string, SdkMarketplaceSource>>;

/** Whether a source declared in the managed settings is the one the marketplace registered from. */
const sameSource = (declared: SdkMarketplaceSource, registered: SdkMarketplaceSource): boolean =>
  matchMarketplaceSource('strict', declared, registered);

/**
 * The `extraKnownMarketplaces` entry of that name in the managed settings, "wherever" the highest
 * managed file that declares it is; an entry that cannot register a marketplace declares nothing.
 */
function declaredSource(view: PolicyView, name: string): SdkMarketplaceSource | undefined {
  const holder = view
    .eachFromHighest('extraKnownMarketplaces')
    .find((each) => each.scope === 'managed' && Object.hasOwn(each.value, name));
  const source = holder?.value[name]?.source;
  return source !== undefined && registrationProblems(name, source).length === 0
    ? source
    : undefined;
}

/** The `strictKnownMarketplaces` list of the managed settings (a parent's is not "the same managed settings"). */
function managedAllowlist(view: PolicyView): readonly SdkMarketplaceSource[] {
  return (
    view.eachFromHighest('strictKnownMarketplaces').find((each) => each.scope === 'managed')
      ?.value ?? []
  );
}

/**
 * The names of `pluginSuggestionMarketplaces` that take effect, in the order the list gives them. A name
 * takes effect only when the marketplace is registered and its registered source is also declared in the
 * same managed settings: as the entry of that name in `extraKnownMarketplaces`, or as an entry of
 * `strictKnownMarketplaces` that admits it. A marketplace registered under the name from another source is
 * ignored. The official marketplace is exempt from the source requirement: its name "can only register
 * from the official Anthropic source". The key counts from managed settings only (its **Scope** line).
 */
export function suggestionMarketplaces(
  view: PolicyView,
  registered: RegisteredMarketplaces,
): readonly string[] {
  const listed = [...new Set(view.get('pluginSuggestionMarketplaces') ?? [])];
  const allowlist = managedAllowlist(view);
  return listed.filter((name) => {
    const source = Object.hasOwn(registered, name) ? registered[name] : undefined;
    if (source === undefined) return false;
    if (name === OFFICIAL_MARKETPLACE) return true;
    const declared = declaredSource(view, name);
    return (
      (declared !== undefined && sameSource(declared, source)) ||
      allowlist.some((entry) => matchMarketplaceSource('strict', entry, source))
    );
  });
}
