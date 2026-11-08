import { error, warning, type PluginIssue } from '../../format/issues.ts';
import type { Settings } from '../../protocol/official.ts';
import { brokenSource } from '../broken-file.ts';
import { readSettingsLayer } from '../read-layer.ts';
import { isRecord } from '../record.ts';

/**
 * The managed sources and what a machine can hold in each (managed-settings.md, "Choose a delivery
 * mechanism", "How Claude Code combines managed sources", "When an admin document counts as
 * present", "Find entries Claude Code dropped"). The kit reads no file, plist or registry: the host
 * says what it found at each source (`SourceRead`) and this module decides what that document is.
 */
export const MANAGED_SOURCES = ['remote', 'plist', 'hklm', 'file', 'hkcu'] as const;
export type ManagedSource = (typeof MANAGED_SOURCES)[number];

/** Why a document exists and could not be read: "the operating system denied the read" or any other failure. */
export const UNREADABLE_CAUSES = ['denied', 'failed'] as const;
export type UnreadableCause = (typeof UNREADABLE_CAUSES)[number];

/** A source that exists and could not be read: the cause and the underlying error's text (errors.md, `Detail: <source>: <reason>`). */
export interface UnreadableRead {
  readonly unreadable: UnreadableCause;
  readonly reason: string;
}

/**
 * What the host found at one source. `undefined`: nothing there (not a failure). `value`: the
 * content, either the parsed JSON or its text (a plist the host converted with `plutil` comes as
 * the converted JSON). `unreadable`: it exists and the read failed, with the error. `malformed`: the
 * platform converter (`plutil`) reported the document malformed, with its message.
 */
export type SourceRead =
  | undefined
  | { readonly value: unknown }
  | UnreadableRead
  | { readonly malformed: string };

/** The control keys: neither counts as a policy key (managed-settings.md, "How Claude Code combines managed sources"). */
export const CONTROL_KEYS: readonly string[] = [
  'managedSourcesBehavior',
  'wslInheritsWindowsSettings',
];

/** Where a document's text becomes an object: each stored form fails in its own ways. */
type Parsed = { readonly object: Readonly<Record<string, unknown>> } | { readonly why: string };

const NOT_OBJECT = 'its top level is not a JSON object';

function parseText(text: string): Parsed {
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? { object: parsed } : { why: NOT_OBJECT };
  } catch (failure) {
    return { why: failure instanceof Error ? failure.message : 'invalid JSON' };
  }
}

const asObject = (value: unknown): Parsed =>
  isRecord(value) ? { object: value } : { why: NOT_OBJECT };

/** The forms a stored policy takes, each with what makes it unparseable (managed-settings.md, "Find entries Claude Code dropped"). */
const FORMS = {
  /** The payload of a fetch, already JSON. */
  payload: asObject,
  /** A file or drop-in: "the file isn't valid JSON, or its top level isn't an object"; an empty one counts as `{}`. */
  jsonFile: (value: unknown): Parsed => {
    if (typeof value !== 'string') return asObject(value);
    return value.trim() === '' ? { object: {} } : parseText(value);
  },
  /** An MDM plist: the content `plutil` converted must be a JSON object. */
  plist: (value: unknown): Parsed =>
    typeof value === 'string' ? parseText(value) : asObject(value),
  /** A registry value: "the `Settings` value isn't a string, is empty, or doesn't hold a JSON object". */
  registryValue: (value: unknown): Parsed => {
    if (typeof value !== 'string') return { why: 'the Settings value is not a string' };
    return value === '' ? { why: 'the Settings value is empty' } : parseText(value);
  },
} as const;
type Form = keyof typeof FORMS;

export interface SourceTraits {
  /** A higher rank is read first. Equal ranks are alternatives for one OS (a plist or the HKLM key), never both. */
  readonly rank: number;
  /** "Admin source: one of the first three sources below. The HKCU registry is user-writable and isn't one." */
  readonly admin: boolean;
  readonly form: Form;
  /** The policy is stored on the machine ("endpoint-managed"), not fetched. */
  readonly onMachine: boolean;
  /** How `/status` names it in `Setting sources`. */
  readonly statusLabel: string;
}

export const SOURCE_TRAITS: { readonly [S in ManagedSource]: SourceTraits } = {
  remote: { onMachine: false, rank: 4, admin: true, form: 'payload', statusLabel: 'remote' },
  plist: { onMachine: true, rank: 3, admin: true, form: 'plist', statusLabel: 'plist' },
  hklm: { onMachine: true, rank: 3, admin: true, form: 'registryValue', statusLabel: 'HKLM' },
  file: { onMachine: true, rank: 2, admin: true, form: 'jsonFile', statusLabel: 'file' },
  hkcu: { onMachine: true, rank: 1, admin: false, form: 'registryValue', statusLabel: 'HKCU' },
};

/** One source after reading: what it delivers and whether it counts. */
export interface AdminDocument {
  readonly source: ManagedSource;
  /** What the file says, repaired as a managed document is (`readSettingsLayer`); `{}` when absent, unreadable or broken. */
  readonly settings: Settings;
  /** The parsed object before repair, for the control keys and the presence rule. */
  readonly raw: Readonly<Record<string, unknown>>;
  /** "A document is present when it sets any policy key to a value other than null", or exists and cannot be read. */
  readonly present: boolean;
  /** It carries at least one policy key, so it can be the policy. */
  readonly delivers: boolean;
  readonly unreadable?: UnreadableCause;
  /** Where and why it could not be read: the label a report names the source by, and the error. */
  readonly unreadableAt?: { readonly label: string; readonly reason: string };
  /** How the file source is made of files: `file`, `drop-ins` or `file + drop-ins`. */
  readonly shape?: string;
  /** Present and not a JSON object: an admin one stops Claude Code from starting. */
  readonly broken: boolean;
  readonly issues: readonly PluginIssue[];
}

const keysSet = (raw: Readonly<Record<string, unknown>>): string[] =>
  Object.entries(raw)
    .filter(([, value]) => value !== null)
    .map(([name]) => name);

/** Any key other than the two control keys, set to a value other than `null`. */
export const deliversPolicyKey = (raw: Readonly<Record<string, unknown>>): boolean =>
  keysSet(raw).some((name) => !CONTROL_KEYS.includes(name));

const absent = (source: ManagedSource, extra: Partial<AdminDocument> = {}): AdminDocument => ({
  source,
  settings: {},
  raw: {},
  present: false,
  delivers: false,
  broken: false,
  issues: [],
  ...extra,
});

/** The failing document: an admin one is fatal (it names the source), the user-writable one is a notice. */
function brokenDocument(
  source: ManagedSource,
  why: string,
  label: string | undefined,
): AdminDocument {
  const named = label === undefined ? '' : `${label}: `;
  const issue = SOURCE_TRAITS[source].admin
    ? brokenSource('managed', why, label)
    : warning(
        'managed:HKCU',
        `${named}the HKCU registry value is not a JSON object and is ignored (${why})`,
      );
  return absent(source, {
    broken: SOURCE_TRAITS[source].admin,
    present: SOURCE_TRAITS[source].admin,
    issues: [issue],
  });
}

/**
 * What one source's read comes to. `label` names the source in a report (a path, `per-user managed
 * preferences`, `Registry: HKLM\SOFTWARE\Policies\ClaudeCode\Settings`).
 */
export function readAdminDocument(
  source: ManagedSource,
  read: SourceRead,
  label?: string,
): AdminDocument {
  if (read === undefined) return absent(source);
  if ('unreadable' in read) {
    // The user-writable registry never blocks launch and is never an admin document.
    return absent(
      source,
      SOURCE_TRAITS[source].admin
        ? {
            present: true,
            unreadable: read.unreadable,
            unreadableAt: {
              label: label ?? SOURCE_TRAITS[source].statusLabel,
              reason: read.reason,
            },
          }
        : {},
    );
  }
  if ('malformed' in read) return brokenDocument(source, read.malformed, label);
  const parsed = FORMS[SOURCE_TRAITS[source].form](read.value);
  if ('why' in parsed) return brokenDocument(source, parsed.why, label);
  const layer = readSettingsLayer('managed', parsed.object, label);
  const delivers = deliversPolicyKey(parsed.object);
  return {
    ...absent(source),
    settings: layer.layer.settings,
    raw: parsed.object,
    present: delivers,
    delivers,
    issues: layer.issues,
  };
}

/** What a failure to read a source costs, when no admin source supplies a policy (managed-settings.md, errors.md). */
export interface UnreadableVerdict {
  /** Claude Code exits at startup. */
  readonly exits: boolean;
  /** `/status` and `claude doctor` record it, and a `-p` run prints it to stderr. */
  readonly recorded: boolean;
  readonly message: string;
}

const UNREADABLE_EXIT = [
  'Unable to read managed policy settings.',
  'This machine may require organization login enforcement, but the policy file failed to load.',
  'Contact your administrator.',
];

/** What each cause comes to: the operating system's denial starts the session without the source; any other failure exits. */
const UNREADABLE_VERDICTS: {
  readonly [C in UnreadableCause]: (detail: string) => UnreadableVerdict;
} = {
  denied: (detail) => ({
    exits: false,
    recorded: true,
    message: `${detail}: the operating system denied the read, so this session starts without that source's policies`,
  }),
  failed: (detail) => ({
    exits: true,
    recorded: true,
    message: [...UNREADABLE_EXIT, '', `Detail: ${detail}`].join('\n'),
  }),
};

/** A cause that exits outranks one that starts the session without the source: the stricter outcome wins. */
const CAUSE_RANK: { readonly [C in UnreadableCause]: number } = { denied: 0, failed: 1 };

export const harsherCause = (a: UnreadableCause, b: UnreadableCause): UnreadableCause =>
  CAUSE_RANK[b] > CAUSE_RANK[a] ? b : a;

/** An issue about a failed read, an error where the cause exits and a warning where it does not. */
const CAUSE_ISSUE: { readonly [C in UnreadableCause]: typeof error } = {
  denied: warning,
  failed: error,
};

export const unreadableIssue = (
  cause: UnreadableCause,
  path: string,
  message: string,
): PluginIssue => CAUSE_ISSUE[cause](path, message);

export const unreadableVerdict = (
  cause: UnreadableCause,
  source: string,
  reason: string,
): UnreadableVerdict => UNREADABLE_VERDICTS[cause](`${source}: ${reason}`);

/** The issue of a verdict, an error when it stops Claude Code. */
export const verdictIssue = (verdict: UnreadableVerdict, path: string): PluginIssue =>
  verdict.exits ? error(path, verdict.message) : warning(path, verdict.message);
