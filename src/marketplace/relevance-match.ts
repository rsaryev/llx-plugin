import type { RelevanceSignals } from '../format/marketplace/types.ts';

/**
 * Whether the signals of a `relevance` block match the session (plugins/relevance.md, "Understand
 * how plugin relevance works", "`relevance.signals`", "Working directory matching", "Command name
 * matching", "Manifest dependency matching"): pure, over the facts the host collected. Matching is
 * local; nothing here reports which signal matched. What the docs leave open (the glob dialect, an
 * invalid regular expression, a compound command's separators) is in spec/judgments.md.
 */

export type SignalName = 'cwd' | 'cli' | 'hosts' | 'filesRead' | 'manifestDeps';

export interface ManifestFact {
  readonly path: string;
  readonly content: string;
  /** Byte size when known; the length of `content` otherwise. */
  readonly size?: number;
}

export interface SessionFacts {
  /** The session's working directory, absolute. */
  readonly cwd: string;
  /** The root of the git repository the session is inside, when it is. */
  readonly repositoryRoot?: string;
  /** The shell commands Claude ran this session. */
  readonly commands: readonly string[];
  /** Paths Claude read, wrote or edited this session, and the project's auto-loaded `CLAUDE.md` files. */
  readonly filesTouched: readonly string[];
  /** The package manifests Claude read, written or edited, and their contents. */
  readonly manifests: readonly ManifestFact[];
}

/** "Manifest files larger than 512 KB are skipped". */
export const MANIFEST_SIZE_LIMIT = 512 * 1024;

const slashes = (path: string): string => path.replaceAll('\\', '/');

const escapeRegex = (text: string): string => text.replace(/[.+^${}()|[\]\\]/g, '\\$&');

/** A glob as a regular expression: `**` crosses `/`, `*` and `?` stay in a segment. */
function globSource(glob: string): string {
  let source = '';
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob.charAt(index);
    if (char === '*' && glob.charAt(index + 1) === '*') {
      const slash = glob.charAt(index + 2) === '/';
      source += slash ? '(?:.*/)?' : '.*';
      index += slash ? 2 : 1;
    } else if (char === '*') source += '[^/]*';
    else if (char === '?') source += '[^/]';
    else source += escapeRegex(char);
  }
  return source;
}

/** "Forward-slash normalized and case-insensitive." */
export const globMatches = (glob: string, path: string): boolean =>
  new RegExp(`^${globSource(slashes(glob))}$`, 'i').test(slashes(path));

/** `infra`, `infra/` and `infra/**` are one pattern: the directory and everything under it. */
const directoryBase = (pattern: string): string => slashes(pattern).replace(/(?:\/\*\*)?\/*$/, '');

function relativeTo(root: string, path: string): string | undefined {
  const base = slashes(root).replace(/\/+$/, '');
  const full = slashes(path);
  if (full.toLowerCase() === base.toLowerCase()) return '';
  return full.toLowerCase().startsWith(`${base.toLowerCase()}/`)
    ? full.slice(base.length + 1)
    : undefined;
}

/**
 * A `cwd` pattern: matched against the absolute working directory and, inside a repository, against
 * its path relative to the root; every pattern "matches the directory itself and everything under it".
 */
export function cwdMatches(pattern: string, cwd: string, repositoryRoot?: string): boolean {
  const base = directoryBase(pattern);
  const under = (path: string): boolean =>
    new RegExp(`^${globSource(base)}(?:/.*)?$`, 'i').test(path);
  if (under(slashes(cwd))) return true;
  const relative = repositoryRoot === undefined ? undefined : relativeTo(repositoryRoot, cwd);
  return relative !== undefined && relative !== '' && under(relative);
}

const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const LEADING_COMMAND = /^(.*?)(?:&&|\|\||[;|&\n]|$)/s;

/**
 * "One command name for each shell command Claude runs: the first token after any leading environment
 * variable assignments and `sudo`. Compound commands contribute only their leading command", so
 * `cd infra && terraform plan` records `cd`.
 */
export function commandName(command: string): string | undefined {
  const leading = LEADING_COMMAND.exec(command)?.[1] ?? '';
  const tokens = leading.split(/\s+/).filter((token) => token !== '');
  const rest = tokens.filter((_, index) => !isSkipped(tokens, index));
  return rest[0];
}

/** Leading assignments and `sudo` words are skipped; the first other token stops the skipping. */
function isSkipped(tokens: readonly string[], index: number): boolean {
  return tokens
    .slice(0, index + 1)
    .every((token) => ENV_ASSIGNMENT.test(token) || token === 'sudo');
}

const URL_HOST = /https?:\/\/([A-Za-z0-9.-]+)/gi;

/** The hostnames of the `http://` and `https://` URLs in a Bash command, lowercased. */
export const commandHosts = (command: string): readonly string[] =>
  [...command.matchAll(URL_HOST)].map((found) => (found[1] ?? '').toLowerCase());

function regexTest(source: string, flags: string, text: string): boolean {
  try {
    return new RegExp(source, flags).test(text);
  } catch {
    return false;
  }
}

const MATCHERS: {
  readonly [S in SignalName]: (signals: RelevanceSignals, facts: SessionFacts) => boolean;
} = {
  cwd: (signals, facts) =>
    (signals.cwd ?? []).some((pattern) => cwdMatches(pattern, facts.cwd, facts.repositoryRoot)),
  cli: (signals, facts) => {
    const names = new Set(facts.commands.map(commandName));
    return (signals.cli ?? []).some((name) => names.has(name));
  },
  hosts: (signals, facts) => {
    const seen = new Set(facts.commands.flatMap(commandHosts));
    return (signals.hosts ?? []).some((host) => seen.has(host.toLowerCase()));
  },
  filesRead: (signals, facts) =>
    (signals.filesRead ?? []).some((glob) =>
      facts.filesTouched.some((path) => globMatches(glob, path)),
    ),
  manifestDeps: (signals, facts) =>
    (signals.manifestDeps ?? []).some((dep) =>
      facts.manifests.some(
        (manifest) =>
          (manifest.size ?? manifest.content.length) <= MANIFEST_SIZE_LIMIT &&
          regexTest(dep.file, 'i', manifest.path) &&
          regexTest(dep.pattern, '', manifest.content),
      ),
    ),
};

const ORDER: readonly SignalName[] = ['cwd', 'cli', 'hosts', 'filesRead', 'manifestDeps'];

/** The signals that match, in the docs' order. Empty when none is set: "only if at least one signal is set". */
export const matchingSignals = (
  signals: RelevanceSignals | undefined,
  facts: SessionFacts,
): readonly SignalName[] =>
  signals === undefined ? [] : ORDER.filter((name) => MATCHERS[name](signals, facts));

/** `cwd` is "the only signal that can match at session start, before the user sends a first message". */
export const matchesAtSessionStart = (
  signals: RelevanceSignals | undefined,
  cwd: string,
  repositoryRoot?: string,
): boolean => (signals?.cwd ?? []).some((pattern) => cwdMatches(pattern, cwd, repositoryRoot));
