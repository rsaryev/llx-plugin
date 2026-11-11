import type { Settings } from '../../protocol/official.ts';
import { isHooksSettings } from '../hooks/merge-groups.ts';
import { MERGES } from '../merge.ts';
import { valueAt } from '../paths.ts';
import { isRecord } from '../../protocol/is-record.ts';

/**
 * How `managedSourcesBehavior: "merge"` combines the sources, by kind of key (managed-settings.md,
 * "Compose every managed source"; settings-reference.md, `managedSourcesBehavior`). One combiner per
 * kind, one table from key to kind; a key with no row is an "other key" (the value of the highest
 * source that sets it), and a block with no row merges key by key so its lists and locks follow
 * their own rows (spec/judgments.md).
 */

/** The values one key has in the sources, highest first; `undefined` where a source leaves it unset. */
export type Values = readonly unknown[];

export interface CombineContext {
  /** The sources' repaired settings, highest first. */
  readonly docs: readonly Settings[];
}
export type Combiner = (values: Values, context: CombineContext) => unknown;

const defined = (values: Values): unknown[] => values.filter((value) => value !== undefined);

/** "Takes the value from the highest-ranked source that sets it." */
const highestSet: Combiner = (values) => defined(values)[0];

/** "Reads the key only from the highest-priority source": a lower source's value is ignored even when this one sets none. */
const highestSourceOnly: Combiner = (values) => values[0];

/** "Combines the entries from every source", duplicates once. */
const unionLists: Combiner = (values) =>
  MERGES.unionArrays.combine(defined(values).filter((value) => Array.isArray(value)));

/** The `hooks` key: every source's groups, the highest source's first. */
const hookGroups: Combiner = (values) =>
  MERGES.hookGroups.combine(defined(values).filter(isHooksSettings));

/** "Combines the server names from every source; when two sources set the same name, applies the higher-ranked source's whole entry." */
const serversByName: Combiner = (values) =>
  MERGES.perKeyHighestWins.combine(defined(values).filter(isRecord));

/**
 * "Applies the strictest value any source sets; a looser value applies only from the highest-ranked
 * source." The ladder lists the strict values from the least to the most strict; any other value
 * (`false`, `"accept"`, `"prefix"`) is a looser one, which counts only where the highest-ranked
 * source sets it (a lower source's looser value is ignored, even when the highest sets none).
 */
function lock(ladder: readonly unknown[]): Combiner {
  const strictness = (value: unknown): number => ladder.indexOf(value);
  return (values) => {
    const strictest = defined(values).reduce<unknown>(
      (best, value) => (strictness(value) > strictness(best) ? value : best),
      undefined,
    );
    return strictness(strictest) >= 0 ? strictest : values[0];
  };
}

/**
 * `env`: "each variable comes from the highest-priority source that defines it", and the
 * telemetry unit (`OTEL_EXPORTER_OTLP_*`, `OTEL_LOG_*`, `OTEL_LOGS_EXPORTER`, the two beta tracing
 * variables) follows the highest source that claims it as one (server-managed-settings.md,
 * "Per-key exceptions across managed sources"). A source claims the unit by setting any of its
 * variables, or by delivering `otelHeadersHelper`; one that only delivers the helper lands none of
 * the variables and still blocks lower sources from filling them in.
 */
const TELEMETRY_UNIT =
  /^(OTEL_EXPORTER_OTLP_|OTEL_LOG_|OTEL_LOGS_EXPORTER$|ENABLE_BETA_TRACING_DETAILED$|BETA_TRACING_ENDPOINT$)/;
const inUnit = (name: string): boolean => TELEMETRY_UNIT.test(name);

function envBlock(value: unknown): Readonly<Record<string, unknown>> {
  return isRecord(value) ? value : {};
}

function claimsUnit(env: unknown, source: Settings): boolean {
  return Object.keys(envBlock(env)).some(inUnit) || source.otelHeadersHelper !== undefined;
}

const combineEnv: Combiner = (values, { docs }) => {
  const claimant = values.findIndex((env, index) => claimsUnit(env, docs[index] ?? {}));
  // A claimant below the selected source that delivers `otelHeadersHelper` lands none of the unit.
  const lands = claimant === 0 || docs[claimant]?.otelHeadersHelper === undefined;
  const merged = new Map<string, unknown>();
  for (let index = values.length - 1; index >= 0; index -= 1) {
    for (const [name, entry] of Object.entries(envBlock(values[index]))) {
      const unitVariable = inUnit(name);
      if (!unitVariable || (index === claimant && lands)) merged.set(name, entry);
    }
  }
  // `Object.fromEntries` defines own properties, so a JSON-parsed `__proto__` name stays a name.
  return merged.size === 0 ? undefined : Object.fromEntries(merged);
};

/**
 * Restriction allowlists and values taken whole: "takes the list whole from the highest source that
 * sets it". `modelOverrides` is taken "from the highest source that sets it" as well
 * (settings-reference.md, `managedSourcesBehavior`; its pairing with `availableModels` is `compose.ts`).
 */
const WHOLE: readonly string[] = [
  'modelOverrides',
  'availableModels',
  'allowedMcpServers',
  'allowedProviders',
  'strictKnownMarketplaces',
  'allowedChannelPlugins',
  'fallbackModel',
  'sandbox.credentials.awsPairs',
  'sandbox.ripgrep',
];

/** "Read from the highest-priority source only" (the login keys have a rule of their own, `login-keys.ts`). */
const HIGHEST_ONLY: readonly string[] = [
  'apiKeyHelper',
  'awsAuthRefresh',
  'awsCredentialExport',
  'gcpAuthRefresh',
  'otelHeadersHelper',
  'proxyAuthHelper',
  'parentSettingsBehavior',
  'modelPicker',
  'policyHelper',
  'permissions.defaultMode',
];

const ON = [true];

/**
 * The locks, each with its strict values from the least to the most strict. The docs name four
 * (`allowManagedHooksOnly`, `permissions.disableBypassPermissionsMode`, `crossSessionInbound`,
 * `availableModelsMatch`) and "other boolean or enum locks"; the rest are the keys the docs describe
 * as restricting (spec/judgments.md). `"exact"` is the strict `availableModelsMatch` (an invalid value
 * reads as it), and `"hold"` and `"refuse"` the strict `crossSessionInbound` (`"refuse"` is "the most
 * restrictive value").
 */
const LOCK_LADDERS: Readonly<Record<string, readonly unknown[]>> = {
  allowManagedHooksOnly: ON,
  allowManagedMcpServersOnly: ON,
  allowManagedPermissionRulesOnly: ON,
  'sandbox.filesystem.allowManagedReadPathsOnly': ON,
  'sandbox.network.allowManagedDomainsOnly': ON,
  'sandbox.network.strictAllowlist': ON,
  disableCommandPluginSources: ON,
  disableSideloadFlags: ON,
  disableAutoMode: ['disable'],
  'permissions.disableBypassPermissionsMode': ['disable'],
  crossSessionInbound: ['hold', 'refuse'],
  availableModelsMatch: ['exact'],
};

const RULES: ReadonlyMap<string, Combiner> = new Map<string, Combiner>([
  ...WHOLE.map((path): [string, Combiner] => [path, highestSet]),
  ...HIGHEST_ONLY.map((path): [string, Combiner] => [path, highestSourceOnly]),
  ...Object.entries(LOCK_LADDERS).map(([path, ladder]): [string, Combiner] => [path, lock(ladder)]),
  ['managedMcpServers', serversByName],
  ['hooks', hookGroups],
  ['env', combineEnv],
]);

function combineValues(path: string, values: Values, context: CombineContext): unknown {
  const rule = RULES.get(path);
  if (rule !== undefined) return rule(values, context);
  const set = defined(values);
  if (set.length === 0) return undefined;
  if (set.every(Array.isArray)) return unionLists(values, context);
  if (set.every(isRecord))
    return combineBlocks(
      path,
      values.map((value) => (isRecord(value) ? value : undefined)),
      context,
    );
  return set[0];
}

/** The blocks key by key, each key by its own row. */
function combineBlocks(
  path: string,
  blocks: readonly (Readonly<Record<string, unknown>> | undefined)[],
  context: CombineContext,
): Record<string, unknown> {
  const names = [...new Set(blocks.flatMap((block) => Object.keys(block ?? {})))];
  const entries = names.flatMap((name): [string, unknown][] => {
    const joined = path === '' ? name : `${path}.${name}`;
    const value = combineValues(
      joined,
      blocks.map((block) => block?.[name]),
      context,
    );
    return value === undefined ? [] : [[name, value]];
  });
  // `Object.fromEntries` defines own properties, so a JSON-parsed `__proto__` name stays a name.
  return Object.fromEntries(entries);
}

/** The settings of the sources (highest first) as `"merge"` combines them. */
export function combineSources(docs: readonly Settings[]): Settings {
  return combineBlocks('', docs, { docs });
}

/** One key across the sources (highest first) by its row: what a cross-source key needs without the rest of the settings. */
export function combineKey(path: string, docs: readonly Settings[]): unknown {
  return combineValues(
    path,
    docs.map((doc) => valueAt(doc, path)),
    { docs },
  );
}
