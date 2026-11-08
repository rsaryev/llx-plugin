import { INSTALL_RULE, isPluginIdPart } from '../format/marketplace/ids.ts';

/**
 * What `claude plugin marketplace add` and an install say when the source cannot be fetched
 * (plugins/troubleshooting.md, "Invalid git URL", "Path does not exist: <path>", "Marketplace file
 * not found at ...", "Git clone timed out after 120s", `Marketplace "<name>" not found`). Pure: the
 * host found the failure, the kit words it. The texts the docs quote are the docs'; the rest is the
 * output of `claude plugin marketplace add` 2.1.319, recorded in spec/judgments.md as `oracle 2.1.319`.
 */

const FAILED = 'Failed to add marketplace: ';

export type AddFailure =
  /** A local path with nothing at it; the host resolved it against its working directory. */
  | { readonly kind: 'path-missing'; readonly path: string }
  /** A path to a file that is not a `.json` file. */
  | { readonly kind: 'not-json'; readonly path: string }
  /** The marketplace was cloned, found, or downloaded but holds no `marketplace.json` at `path`. */
  | { readonly kind: 'file-missing'; readonly path: string }
  /** A relative `source` whose directory is missing; `path` is "the absolute location Claude Code checked". */
  | { readonly kind: 'source-path-missing'; readonly path: string }
  /** The clone ran past `timeoutMs` (`CLAUDE_CODE_PLUGIN_GIT_TIMEOUT_MS`, default 120000). */
  | { readonly kind: 'clone-timeout'; readonly timeoutMs: number };

const WORDING: {
  readonly [K in AddFailure['kind']]: (failure: Extract<AddFailure, { kind: K }>) => string;
} = {
  'path-missing': (failure) => `Path does not exist: ${failure.path}`,
  'not-json': (failure) =>
    `File path must point to a .json file (marketplace.json), but got: ${failure.path}`,
  'source-path-missing': (failure) => `Source path does not exist: ${failure.path}`,
  'file-missing': (failure) => `${FAILED}Marketplace file not found at ${failure.path}`,
  'clone-timeout': (failure) =>
    `${FAILED}Git clone timed out after ${Math.round(failure.timeoutMs / 1000)}s. Set CLAUDE_CODE_PLUGIN_GIT_TIMEOUT_MS to a larger number of milliseconds to allow more time`,
};

const wording = <K extends AddFailure['kind']>(failure: Extract<AddFailure, { kind: K }>): string =>
  WORDING[failure.kind](failure);

/** The line a failed add ends with. */
export const addFailureMessage = (failure: AddFailure): string => wording(failure);

const SUPPORTED =
  "Supported: https, http, ssh (also written git+ssh or ssh+git), user@host:path, or a local file:// address with no host. git:// isn't supported because it isn't encrypted.";

const REMOTE_URL = /^(?:https?|ssh|git\+ssh|ssh\+git):\/\/([^/?#]*)/i;
const SCP_FORM = /^([^\s/@:]+)@([^\s/@:]+):(\S+)$/;

const UNREADABLE = 'it could not be read as a URL';
const dashed = (text: string | undefined): boolean => (text ?? '').startsWith('-');

/** One reader per address form: the reason it is refused, `undefined` when it passes, `null` when the form is not its own. */
type FormReader = (address: string) => string | undefined | null;

const readScp: FormReader = (address) => {
  const scp = SCP_FORM.exec(address);
  if (scp === null) return null;
  return dashed(scp[1]) || dashed(scp[2]) ? UNREADABLE : undefined;
};

const readRemote: FormReader = (address) => {
  const remote = REMOTE_URL.exec(address);
  if (remote === null) return null;
  const host = remote[1]?.split('@').at(-1) ?? '';
  return host === '' || dashed(host) ? UNREADABLE : undefined;
};

const readFile: FormReader = (address) => {
  const file = /^file:\/\/([^/]*)/i.exec(address);
  if (file === null) return null;
  return file[1] === '' ? undefined : 'a file:// address must have no host';
};

const readOther: FormReader = (address) => {
  const protocol = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(address)?.[1];
  return protocol === undefined
    ? UNREADABLE
    : `the protocol "${protocol.toLowerCase()}:" is not supported`;
};

const READERS: readonly FormReader[] = [readScp, readRemote, readFile];

/** Why an address is refused, or `undefined` when it is one Claude Code runs git with. */
function refusalReason(address: string): string | undefined {
  for (const read of READERS) {
    const reason = read(address);
    if (reason !== null) return reason;
  }
  return readOther(address) ?? undefined;
}

/**
 * "Claude Code checks every git address before running git": a protocol it doesn't support, and an
 * address git could read as naming a different server than the one shown, are refused with `Invalid
 * git URL` and the reason. The address itself is not echoed (the oracle prints `[redacted URL]`).
 */
export function gitUrlRefusal(address: string): string | undefined {
  const reason = refusalReason(address.trim());
  return reason === undefined
    ? undefined
    : `${FAILED}Invalid git URL: [redacted URL] (${reason}). ${SUPPORTED}`;
}

/** The accepted forms a bare name or hostname is told about (`Invalid marketplace source format`). */
export const ACCEPTED_SOURCE_FORMS: readonly string[] = [
  'a GitHub owner/repo shorthand',
  'an https:// or http:// URL',
  'a user@host:path SSH URL',
  'a local path starting with ./, ../, / or ~',
];

const OFFICIAL = 'claude-plugins-official';
const CLAUDE_AI_PREFIX = 'claudeai-';

export interface MissingMarketplace {
  readonly message: string;
  /** What to run next, as the docs give it; `undefined` when only the marketplace's owner can say. */
  readonly fix?: string;
}

/**
 * `Marketplace "<name>" not found` on `/plugin install <plugin>@<name>`: Claude Code has "no index to
 * look a marketplace name up in", so the fix is the marketplace's source, except for the official
 * marketplace and for a `claudeai-` name, which have a command.
 */
export function missingMarketplace(name: string): MissingMarketplace {
  const message = `Marketplace "${name}" not found`;
  if (name === OFFICIAL)
    return { message, fix: '/plugin marketplace add anthropics/claude-plugins-official' };
  if (name.startsWith(CLAUDE_AI_PREFIX)) {
    return { message, fix: `claude plugin marketplace add --claudeai ${name}` };
  }
  return { message };
}

/**
 * Adding a marketplace whose `name` is not valid as the part after `@` in a plugin id is refused and
 * registers nothing; the text is the docs' ("Cannot add marketplace ..."). An empty name is left to the
 * reader's own "must have a name".
 */
export function idPartRefusal(name: string): string | undefined {
  if (name === '' || isPluginIdPart(name)) return undefined;
  return `Cannot add marketplace "${name}": Claude Code cannot install plugins from a marketplace with this name. ${INSTALL_RULE} The name is set by "name" in the marketplace's marketplace.json; ask its maintainer to change it.`;
}
