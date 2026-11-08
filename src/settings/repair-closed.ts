import { API_PROVIDERS, MODEL_MATCH_MODES } from '../protocol/settings-keys.ts';
import { gatewayNetworksFault } from './repair-network.ts';
import { isRecord } from './record.ts';
import {
  dropped,
  failedClosed,
  failedClosedNoValue,
  kept,
  stripInvalid,
  type Repair,
} from './repair-support.ts';

/**
 * The repairs of the keys that have their own fallback (managed-settings.md, "Keys that fail
 * closed", the table): in the policy tier an unreadable value reads as the fallback the table gives;
 * every other source loses the value, and an individual invalid entry is stripped everywhere.
 */

const isText = (entry: unknown): entry is string => typeof entry === 'string';

/** An `allowedMcpServers` or `deniedMcpServers` entry: at least one of `serverName`, `serverCommand`, `serverUrl`, each of its type (spec/judgments.md). */
function readServerEntry(entry: unknown): Readonly<Record<string, unknown>> | undefined {
  if (!isRecord(entry)) return undefined;
  const { serverName, serverCommand, serverUrl } = entry;
  const command =
    serverCommand === undefined ||
    (Array.isArray(serverCommand) && serverCommand.length > 0 && serverCommand.every(isText));
  const text = (field: unknown): boolean => field === undefined || isText(field);
  const named = [serverName, serverCommand, serverUrl].some((field) => field !== undefined);
  return named && command && text(serverName) && text(serverUrl) ? entry : undefined;
}

const SERVER_ENTRY = 'Expected { serverName }, { serverCommand } or { serverUrl }';

/**
 * `allowedMcpServers`: unreadable in managed settings it is an empty allowlist, so no server users
 * add is admitted; an individual invalid entry is stripped and the valid subset enforced.
 */
export const mcpAllowlist: Repair = (value, at) => {
  if (!Array.isArray(value)) {
    return at.closed
      ? failedClosed(at, [], 'an empty allowlist: no MCP server users add is admitted')
      : dropped(at, `"${at.key}" must be a list of servers`);
  }
  const { entries, issues } = stripInvalid(value, at, readServerEntry, SERVER_ENTRY);
  return kept(entries, issues);
};

/**
 * `deniedMcpServers`: an invalid entry is stripped; a wholly invalid value is dropped with a
 * warning, "since denying every server would block servers the policy never named".
 */
export const mcpDenylist: Repair = (value, at) => {
  if (!Array.isArray(value)) return dropped(at, `"${at.key}" must be a list of servers`);
  const { entries, issues } = stripInvalid(value, at, readServerEntry, SERVER_ENTRY);
  return kept(entries, issues);
};

const readProvider = (entry: unknown): string | undefined =>
  API_PROVIDERS.find((provider) => provider === entry);

/**
 * `allowedProviders`: unreadable in managed settings it is an empty allowlist, so every provider is
 * refused; an entry that is no known provider name is dropped and reported, the rest enforced.
 */
export const providerAllowlist: Repair = (value, at) => {
  if (!Array.isArray(value)) {
    return at.closed
      ? failedClosed(at, [], 'an empty allowlist: every API provider is refused')
      : dropped(at, `"${at.key}" must be a list of provider names`);
  }
  const { entries, issues } = stripInvalid(value, at, readProvider, 'Not a known provider name');
  return kept(entries, issues);
};

/** `availableModelsMatch`: `prefix` or `exact`; unreadable in managed settings it reads as `exact`. */
export const matchMode: Repair = (value, at) => {
  const mode = MODEL_MATCH_MODES.find((known) => known === value);
  if (mode !== undefined) return kept(mode);
  return at.closed
    ? failedClosed(at, 'exact', 'exact')
    : dropped(at, `"${at.key}" must be one of ${MODEL_MATCH_MODES.join(', ')}`);
};

/**
 * `deniedModels`: a non-text entry is stripped and the rest enforced; a wholly invalid value is
 * dropped with a warning and blocks no model until fixed.
 */
export const modelDenylist: Repair = (value, at) => {
  if (!Array.isArray(value)) return dropped(at, `"${at.key}" must be a list of models`);
  const { entries, issues } = stripInvalid(
    value,
    at,
    (entry) => (isText(entry) ? entry : undefined),
    'Expected a text',
  );
  return kept(entries, issues);
};

/**
 * `forceLoginOrgUUID`: a UUID or a list of them. In managed settings "a value that isn't a string or
 * an array of strings" admits no organization, which the empty list says: any of no organizations
 * (settings-reference.md, `forceLoginOrgUUID`; spec/judgments.md). A list with one non-text entry is
 * not an array of strings, so it reads that way whole: stripping the entry would admit the others.
 * Outside the policy tier an invalid entry is stripped like any list entry.
 */
export const orgUuid: Repair = (value, at) => {
  if (isText(value)) return kept(value);
  if (Array.isArray(value) && (!at.closed || value.every(isText))) {
    const { entries, issues } = stripInvalid(
      value,
      at,
      (entry) => (isText(entry) ? entry : undefined),
      'Expected a text',
    );
    return kept(entries, issues);
  }
  return at.closed
    ? failedClosed(at, [], 'no organization is permitted to log in')
    : dropped(at, `"${at.key}" must be a UUID or a list of UUIDs`);
};

/**
 * `gatewayInternalNetworks`: unreadable in managed settings, `/login` "refuses every new cloud
 * gateway sign-in on that machine until the value is fixed". No value says that, so the layer records
 * the key as invalid (`PolicyLayer.invalid`).
 */
export const gatewayNetworks: Repair = (value, at) => {
  const fault = gatewayNetworksFault(value);
  if (fault === undefined) return kept(value);
  return at.closed
    ? failedClosedNoValue(at, `${fault}; /login refuses every new cloud gateway sign-in`)
    : dropped(at, fault);
};

/** A key another module judges from the document as written: kept whatever the value. */
export const asWritten: Repair = (value) => kept(value);
