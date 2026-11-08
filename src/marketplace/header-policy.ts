/**
 * Whether a `headersHelper` command may run, and which rules follow from where it was declared
 * (plugins/host-marketplace.md, "Authenticate archive downloads": the table of places; "When Claude
 * Code skips a headersHelper command or drops its output"; "How users accept a headersHelper
 * command"; "Installs and updates that refuse a command instead of asking"; "When a marketplace
 * `url` source's command runs"; settings-reference.md, `extraKnownMarketplaces`,
 * `allowManagedHooksOnly`, `disableCommandPluginSources`). Pure: the host's answers (trust, user
 * acceptance, policy) come in as data; the acceptance prompt itself is the host's.
 */

/** The two places `headers` and `headersHelper` can be set. */
export const HEADER_PLACES = ['url-source', 'entry'] as const;
export type HeaderPlace = (typeof HEADER_PLACES)[number];

/**
 * Where the declaration lives: a `marketplace.json` entry (`catalog`), or a settings file: user
 * settings, a `--settings` file, a managed settings file on the machine, server-managed settings,
 * a project's `.claude/settings.json` or `settings.local.json`, or an `--add-dir` directory's.
 */
export const HEADER_ORIGINS = [
  'catalog',
  'user',
  'cli-settings',
  'managed',
  'server-managed',
  'project',
  'add-dir',
] as const;
export type HeaderOrigin = (typeof HEADER_ORIGINS)[number];

/** What the user is doing when an entry's archive is about to be downloaded. */
export const PLUGIN_OPERATIONS = [
  'install',
  'update',
  'bulk-install',
  'suggestion',
  'dependency',
  'background-update',
  'session-start',
] as const;
export type PluginOperation = (typeof PLUGIN_OPERATIONS)[number];

/**
 * The command and archive URL the user was shown and accepted. `queryCounts` is set for the VS Code
 * extension and `--accept-command`, where a change in the query string is a change too.
 */
export interface AcceptedCommand {
  readonly command: string;
  readonly archiveUrl: string;
  readonly queryCounts?: boolean;
}

/** One `headers`/`headersHelper` declaration, with what the policy needs to know about it. */
export interface HeaderLayer {
  readonly place: HeaderPlace;
  readonly origin: HeaderOrigin;
  readonly headers?: Readonly<Record<string, string>>;
  readonly headersHelper?: string;
  /** The `CLAUDE_CODE_*` variables Claude Code sets for the command (`urlSourceLayer`, `entryLayer`). */
  readonly variables: Readonly<Record<string, string>>;
  /** A `url` source: the marketplace URL the command is declared for. */
  readonly marketplaceUrl?: string;
  /** An entry: the archive URL its command runs for. */
  readonly archiveUrl?: string;
  /** An entry: what the user is doing, and the command and archive URL they accepted. */
  readonly operation?: PluginOperation;
  readonly accepted?: AcceptedCommand;
}

/** What the host knows when it asks. */
export interface HeadersSetting {
  readonly platform: 'posix' | 'windows';
  /** The user accepted the workspace trust dialog for the project folder itself. */
  readonly folderTrusted: boolean;
  /** The user approved the delivered server-managed settings in the security approval dialog. */
  readonly settingsApproved: boolean;
  readonly disableCommandPluginSources?: boolean;
  readonly allowManagedHooksOnly?: boolean;
  /** Managed settings themselves declare the marketplace the command belongs to. */
  readonly managedMarketplace: boolean;
}

type Consent = 'none' | 'never' | 'folder-trust' | 'settings-approval';

interface OriginRule {
  /** "Header filter": routing and identity names dropped from an entry declared here. */
  readonly filtersRouting: boolean;
  /** "Variables Claude Code removes": credential variables stay out of a command declared here. */
  readonly stripsCredentials: boolean;
  readonly consent: Consent;
}

const ORIGIN_RULES: { readonly [O in HeaderOrigin]: OriginRule } = {
  catalog: { filtersRouting: true, stripsCredentials: true, consent: 'none' },
  user: { filtersRouting: false, stripsCredentials: false, consent: 'none' },
  'cli-settings': { filtersRouting: false, stripsCredentials: false, consent: 'none' },
  managed: { filtersRouting: false, stripsCredentials: false, consent: 'none' },
  // Judgment: server-managed settings are managed settings, so no filter and no removal.
  'server-managed': {
    filtersRouting: false,
    stripsCredentials: false,
    consent: 'settings-approval',
  },
  project: { filtersRouting: true, stripsCredentials: true, consent: 'folder-trust' },
  'add-dir': { filtersRouting: true, stripsCredentials: true, consent: 'never' },
};

/** Whether a place filters at all: only an entry's headers are filtered, never a `url` source's. */
const PLACE_FILTERS: { readonly [P in HeaderPlace]: boolean } = {
  'url-source': false,
  entry: true,
};

/** "Every `marketplace.json` entry is filtered this way", and an entry in project or `--add-dir` settings. */
export const filtersRouting = (layer: HeaderLayer): boolean =>
  PLACE_FILTERS[layer.place] && ORIGIN_RULES[layer.origin].filtersRouting;

export const stripsCredentials = (layer: HeaderLayer): boolean =>
  ORIGIN_RULES[layer.origin].stripsCredentials;

/**
 * Why a command did not run. `skip-helper`: the fixed `headers` still go (judgment where the docs
 * only say the command does not run). `refuse-download`: the plugin is not downloaded at all.
 */
export const HELPER_REASONS = [
  'ignored-add-dir',
  'not-https',
  'folder-not-trusted',
  'settings-not-approved',
  'blocked-by-policy',
  'not-accepted',
  'needs-own-view',
  'listed-in-errors',
] as const;
export type HelperReason = (typeof HELPER_REASONS)[number];

export type HelperEffect = 'skip-helper' | 'refuse-download';

const REFUSALS: {
  readonly [R in HelperReason]: { readonly effect: HelperEffect; readonly message: string };
} = {
  'ignored-add-dir': {
    effect: 'skip-helper',
    message:
      "A headersHelper set in the settings of a directory added with --add-dir is ignored; only that file's headers are sent",
  },
  'not-https': {
    effect: 'skip-helper',
    message:
      'The marketplace URL does not start with https://, so its headersHelper does not run; requests carry only its headers field',
  },
  'folder-not-trusted': {
    effect: 'skip-helper',
    message:
      'The headersHelper is declared in a project settings file and runs only after the folder itself is trusted',
  },
  'settings-not-approved': {
    effect: 'skip-helper',
    message:
      'The headersHelper is declared in server-managed settings and runs only after the user approves them',
  },
  'blocked-by-policy': {
    effect: 'skip-helper',
    message:
      'Managed settings block headersHelper commands (disableCommandPluginSources, or allowManagedHooksOnly without an explicit false)',
  },
  'not-accepted': {
    effect: 'refuse-download',
    message:
      'The plugin runs a headersHelper command and the user has not accepted it, so its archive is not downloaded',
  },
  'needs-own-view': {
    effect: 'refuse-download',
    message:
      'The plugin runs a headersHelper command: install it by itself from its own view in /plugin',
  },
  'listed-in-errors': {
    effect: 'refuse-download',
    message:
      'The plugin runs a headersHelper command: it is listed in the /plugin Errors tab, install or update it yourself',
  },
};

export type HelperVerdict =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason: HelperReason;
      readonly effect: HelperEffect;
      readonly message: string;
    };

type Check = (layer: HeaderLayer, setting: HeadersSetting) => HelperReason | undefined;

const CONSENT: { readonly [C in Consent]: Check } = {
  none: () => undefined,
  never: () => 'ignored-add-dir',
  'folder-trust': (_, setting) => (setting.folderTrusted ? undefined : 'folder-not-trusted'),
  'settings-approval': (_, setting) =>
    setting.settingsApproved ? undefined : 'settings-not-approved',
};

const consentCheck: Check = (layer, setting) =>
  CONSENT[ORIGIN_RULES[layer.origin].consent](layer, setting);

const HTTPS = /^https:\/\//i;
const httpsCheck: Check = (layer) =>
  layer.marketplaceUrl !== undefined && HTTPS.test(layer.marketplaceUrl) ? undefined : 'not-https';

/** What each operation does to an entry's command: only a single install or update asks the user. */
const OPERATION_REASONS: { readonly [O in PluginOperation]: HelperReason | undefined } = {
  install: undefined,
  update: undefined,
  'bulk-install': 'needs-own-view',
  suggestion: 'needs-own-view',
  dependency: 'needs-own-view',
  'background-update': 'listed-in-errors',
  'session-start': 'listed-in-errors',
};

const operationCheck: Check = (layer) =>
  layer.operation === undefined ? 'not-accepted' : OPERATION_REASONS[layer.operation];

/** The URL without its query string (and what follows it), or the text as written when it is no URL. */
const withoutQuery = (url: string): string => {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    return parsed.href;
  } catch {
    return url;
  }
};

/** "Claude Code runs only the command it showed, for the archive URL it showed." */
const acceptedCheck: Check = (layer) => {
  const { accepted } = layer;
  if (accepted === undefined || accepted.command !== layer.headersHelper) return 'not-accepted';
  const [shown, now] = [accepted.archiveUrl, layer.archiveUrl ?? ''];
  const same =
    accepted.queryCounts === true ? shown === now : withoutQuery(shown) === withoutQuery(now);
  return same ? undefined : 'not-accepted';
};

/**
 * "disableCommandPluginSources to true blocks headersHelper commands, and allowManagedHooksOnly
 * blocks them too unless disableCommandPluginSources is explicitly false. Under either block,
 * Claude Code still runs the command for a marketplace that managed settings themselves declare."
 */
const policyCheck: Check = (_, setting) => {
  const { disableCommandPluginSources: disabled, allowManagedHooksOnly: managedOnly } = setting;
  const blocked = disabled === true || (managedOnly === true && disabled !== false);
  return blocked && !setting.managedMarketplace ? 'blocked-by-policy' : undefined;
};

const PLACE_CHECKS: { readonly [P in HeaderPlace]: readonly Check[] } = {
  'url-source': [httpsCheck],
  entry: [operationCheck, acceptedCheck],
};

const verdictOf = (reason: HelperReason): HelperVerdict => ({
  allowed: false,
  reason,
  ...REFUSALS[reason],
});

/** Whether the layer's command may run now, or why not (and what that does to the download). */
export function helperAllowed(layer: HeaderLayer, setting: HeadersSetting): HelperVerdict {
  const checks = [consentCheck, ...PLACE_CHECKS[layer.place], policyCheck];
  for (const check of checks) {
    const reason = check(layer, setting);
    if (reason !== undefined) return verdictOf(reason);
  }
  return { allowed: true };
}
