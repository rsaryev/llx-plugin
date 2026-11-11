/**
 * `extraKnownMarketplaces` as the plan a host executes: which marketplaces register, from what, and
 * why a declaration does not (settings-reference.md, `extraKnownMarketplaces`, "Marketplace source
 * types", "Marketplace key aliases"; plugins/org.md, "Require a marketplace and its plugins",
 * "Require plugins per repository", "Allow the official marketplace and your own"; plugins/loading.md,
 * "Which marketplaces and plugins auto-update"). Cloning, refreshing and running a `headersHelper`
 * are the host's. The aliases are already rewritten by `readSettingsLayer`.
 */
import type { PluginIssue } from '../../format/issues.ts';
import { error } from '../../format/issues.ts';

import type { SdkMarketplaceSource, Settings } from '../../protocol/official.ts';
import type { KeyHolder, PolicyScope } from '../layers.ts';
import { enabledPlugin } from '../plugins/enabled-plugins.ts';
import { parsePluginId } from '../plugins/plugin-id.ts';
import { SCOPE_RANK } from '../layers.ts';
import type { PolicyView } from '../view.ts';
import { plannedSource } from './headers-helper.ts';
import { registrationProblems } from './source-validate.ts';
import { isOfficialButOff } from '../../format/marketplace/marketplace-name-lists.ts';

type Entry = NonNullable<Settings['extraKnownMarketplaces']>[string];

/**
 * Anthropic's official marketplace, which "needs no `extraKnownMarketplaces` entry when
 * `enabledPlugins` sets one of its plugins to `true`" (plugins/org.md). Its source is the one the
 * docs' allowlist example names ("Allow only the official marketplace").
 */
export const OFFICIAL_MARKETPLACE = 'claude-plugins-official';
const OFFICIAL_SOURCE: SdkMarketplaceSource = {
  source: 'github',
  repo: 'anthropics/claude-plugins-official',
};

/**
 * - `register`: the host adds the marketplace from this entry.
 * - `ignoredUntrusted`: a project, local or `--add-dir` entry in a folder that is not trusted.
 * - `refusedByAllowlist`: the allowlist or blocklist does not let the source in; `issues` says why.
 * - `invalid`: the entry cannot name a marketplace (`issues` says why).
 * - `shadowed`: a higher-precedence file declares the same name; this entry is replaced whole.
 */
export type RegistrationStatus =
  | 'register'
  | 'ignoredUntrusted'
  | 'refusedByAllowlist'
  | 'invalid'
  | 'shadowed';

export interface Registration {
  readonly name: string;
  readonly entry: { readonly source: SdkMarketplaceSource; readonly autoUpdate: boolean };
  readonly from: PolicyScope;
  readonly status: RegistrationStatus;
  /** The official marketplace declared by an `enabledPlugins` entry, not by an `extraKnownMarketplaces` one. */
  readonly implied: boolean;
  /** A registered managed entry that sets `autoUpdate`: the user's `/plugin` toggle is refused. */
  readonly autoUpdateFixed: boolean;
  /**
   * The settings file whose entry sets `autoUpdate`, by its scope and its position among the layers;
   * absent when this entry leaves it unset and `entry.autoUpdate` is the default (a lower entry's
   * value never carries over: "inherits none of its fields"). Judgment (spec/judgments.md).
   */
  readonly autoUpdateFrom?: SettingsFile;
  readonly issues: readonly PluginIssue[];
}

/** One settings file, as the layers order them: two files of one scope have two positions. */
export type SettingsFile = Pick<KeyHolder<'extraKnownMarketplaces'>, 'scope' | 'position'>;

/** What the registry needs from the host, as plain data and one injected check. */
export interface RegistryContext {
  /** Whether the user accepted the workspace trust dialog for the folder of that kind of file. */
  readonly isFolderTrusted: (scope: 'project' | 'local' | 'addDir') => boolean;
  /** Marketplaces Anthropic runs whose `autoUpdate` defaults on; Anthropic's list is not in the docs. */
  readonly officialMarketplaces: readonly string[];
  /** The marketplace gate's `check` (allowlist and blocklist), taken as a function. */
  readonly check: (
    source: SdkMarketplaceSource,
  ) => { readonly allowed: true } | { readonly allowed: false; readonly message: string };
}

export interface MarketplaceRegistry {
  /** Every declaration, per name from the highest-precedence file down; names in order of appearance. */
  registrations(): readonly Registration[];
}

/**
 * Whether the file's folder must be trusted first. Project and local files are the documented gate;
 * a `--add-dir` directory's files ask the host too (spec/judgments.md).
 */
const TRUST: { readonly [S in PolicyScope]: (context: RegistryContext) => boolean } = {
  managed: () => true,
  parent: () => true,
  flag: () => true,
  user: () => true,
  project: (context) => context.isFolderTrusted('project'),
  local: (context) => context.isFolderTrusted('local'),
  addDir: (context) => context.isFolderTrusted('addDir'),
};

interface Declaration {
  readonly name: string;
  readonly entry: Entry;
  readonly from: PolicyScope;
  /** The layer's position; absent for the official marketplace an `enabledPlugins` entry implies. */
  readonly position?: number;
}

const declarations = (view: PolicyView): Map<string, Declaration[]> => {
  const byName = new Map<string, Declaration[]>();
  for (const holder of view.eachFromHighest('extraKnownMarketplaces')) {
    for (const [name, entry] of Object.entries(holder.value)) {
      const declared = { name, entry, from: holder.scope, position: holder.position };
      byName.set(name, [...(byName.get(name) ?? []), declared]);
    }
  }
  return byName;
};

const autoUpdateOf = (declaration: Declaration, context: RegistryContext): boolean =>
  declaration.entry.autoUpdate ??
  (declaration.name === OFFICIAL_MARKETPLACE ||
    (context.officialMarketplaces.includes(declaration.name) &&
      !isOfficialButOff(declaration.name)));

function registration(
  declaration: Declaration,
  context: RegistryContext,
  status: RegistrationStatus,
  issues: readonly PluginIssue[] = [],
): Registration {
  const { name, entry, from, position } = declaration;
  return {
    name,
    entry: {
      source: plannedSource(entry.source, from),
      autoUpdate: autoUpdateOf(declaration, context),
    },
    from,
    status,
    implied: false,
    autoUpdateFixed:
      status === 'register' && from === 'managed' && typeof entry.autoUpdate === 'boolean',
    ...(typeof entry.autoUpdate === 'boolean' && position !== undefined
      ? { autoUpdateFrom: { scope: from, position } }
      : {}),
    issues,
  };
}

/** The entry that precedence picked: it must name a marketplace and pass the allowlist and blocklist. */
function decide(declaration: Declaration, context: RegistryContext): Registration {
  const problems = registrationProblems(declaration.name, declaration.entry.source);
  if (problems.length > 0) return registration(declaration, context, 'invalid', problems);
  const verdict = context.check(declaration.entry.source);
  if (verdict.allowed) return registration(declaration, context, 'register');
  const path = `extraKnownMarketplaces.${declaration.name}.source`;
  return registration(declaration, context, 'refusedByAllowlist', [error(path, verdict.message)]);
}

/**
 * One name across the files. An entry in an untrusted folder is "ignored without a message", as if
 * it were not there, so the highest entry left decides and replaces every lower one whole
 * (settings-reference.md: "inherits none of its fields"). Whether that entry then passes the policy
 * does not bring a lower one back (spec/judgments.md).
 */
function planName(
  entries: readonly Declaration[],
  context: RegistryContext,
): readonly Registration[] {
  const winner = entries.find((entry) => TRUST[entry.from](context));
  return entries.map((entry) => {
    if (entry === winner) return decide(entry, context);
    return registration(
      entry,
      context,
      TRUST[entry.from](context) ? 'shadowed' : 'ignoredUntrusted',
    );
  });
}

/** The highest scope whose `enabledPlugins` turns on a plugin of the official marketplace. */
function officialEnabledBy(view: PolicyView): PolicyScope | undefined {
  const scopes = Object.keys(view.get('enabledPlugins') ?? {})
    .filter((id) => parsePluginId(id)?.origin === OFFICIAL_MARKETPLACE)
    .flatMap((id) => {
      const decision = enabledPlugin(view, id);
      return decision.on && decision.decidedBy !== 'defaultEnabled' ? [decision.decidedBy] : [];
    });
  return scopes.toSorted((a, b) => SCOPE_RANK[b] - SCOPE_RANK[a])[0];
}

/** Whether a declaration was read at all: an ignored one is as if absent, any other one names the marketplace. */
const IS_READ: { readonly [S in RegistrationStatus]: boolean } = {
  register: true,
  refusedByAllowlist: true,
  invalid: true,
  shadowed: true,
  ignoredUntrusted: false,
};

const hasEffectiveEntry = (planned: readonly Registration[] | undefined): boolean =>
  planned?.some((each) => IS_READ[each.status]) ?? false;

export function createMarketplaceRegistry(
  view: PolicyView,
  context: RegistryContext,
): MarketplaceRegistry {
  return {
    registrations() {
      const byName = declarations(view);
      const planned = new Map(
        [...byName].map(([name, entries]) => [name, planName(entries, context)]),
      );
      const enabledBy = officialEnabledBy(view);
      if (enabledBy !== undefined && !hasEffectiveEntry(planned.get(OFFICIAL_MARKETPLACE))) {
        const implied = decide(
          { name: OFFICIAL_MARKETPLACE, entry: { source: OFFICIAL_SOURCE }, from: enabledBy },
          context,
        );
        planned.set(OFFICIAL_MARKETPLACE, [
          ...(planned.get(OFFICIAL_MARKETPLACE) ?? []),
          { ...implied, implied: true },
        ]);
      }
      return [...planned.values()].flat();
    },
  };
}
