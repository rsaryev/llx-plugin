import { error, type PluginIssue } from '../format/issues.ts';
import { DEFAULT_MARKETPLACE_PATH } from '../format/marketplace/marketplace-source.ts';
import type { MarketplaceSource, MarketplaceSourceOf } from '../format/marketplace/types.ts';
import { isGitHubRepository } from './source-safety.ts';

/**
 * The marketplace source `claude plugin marketplace add <source>` builds from the string you type
 * (plugins/cli-reference.md, "plugin marketplace add": the table of forms, the unrecognized-source
 * and bare-host messages, `--sparse`; plugins/marketplace-reference.md, "Marketplace sources"): pure
 * text in, a source or an issue out. The order the forms are tried in, and what the docs leave
 * open, are in spec/judgments.md.
 */

export interface MarketplaceInputOptions {
  /** `.\`, `..\` and `C:\` paths are accepted only on Windows. */
  readonly platform?: 'posix' | 'windows';
  /** The `--sparse` directories; for `github` and `git` sources only. */
  readonly sparse?: readonly string[];
}

type Parsed = MarketplaceSource | PluginIssue;

const UNRECOGNIZED = 'Invalid marketplace source format. Try: owner/repo, https://..., or ./path';
const refused = (message: string): PluginIssue => error('source', message);

// ---- local paths ----

const POSIX_PATH = /^(?:\.\.?\/|\/|~\/)/;
const WINDOWS_PATH = /^(?:\.\.?\\|[A-Za-z]:\\)/;

const isPath = (text: string, platform: 'posix' | 'windows'): boolean =>
  POSIX_PATH.test(text) || (platform === 'windows' && WINDOWS_PATH.test(text));

/** A path to a `.json` file is a `file` source; any other path is a directory. */
const pathSource = (path: string): Parsed =>
  path.toLowerCase().endsWith('.json') ? { kind: 'file', path } : { kind: 'directory', path };

// ---- http(s) URLs ----

const HTTP_URL = /^(https?):\/\/([^/?#]+)(\/[^?#]*)?(\?[^#]*)?(#.*)?$/i;
const FORGES = ['github.com', 'gitlab.com'] as const;

/** `#ref` after a git form: the text before it and the ref, which may not be empty. */
function splitRef(text: string): { readonly base: string; readonly ref?: string } | undefined {
  const hash = text.indexOf('#');
  if (hash < 0) return { base: text };
  const ref = text.slice(hash + 1);
  return ref === '' ? undefined : { base: text.slice(0, hash), ref };
}

const git = (url: string, ref: string | undefined): Parsed => ({
  kind: 'git',
  url,
  path: DEFAULT_MARKETPLACE_PATH,
  ...(ref === undefined ? {} : { ref }),
});

/** Segments of a forge path that are not part of a repository name: GitLab's `/-/` separates a project from its pages. */
const FORGE_SEPARATOR = '-';

/**
 * A repository on github.com (exactly `owner/repo`) or gitlab.com (a namespace and a project,
 * subgroups included). A path to a file in a repository (`.json`, or after `/-/`) is not one.
 */
function isForgeRepository(host: string, path: string): boolean {
  const forge = host.toLowerCase();
  if (!FORGES.some((known) => known === forge)) return false;
  const segments = path.split('/').filter((part) => part !== '');
  const last = segments.at(-1) ?? '';
  const sized = forge === 'github.com' ? segments.length === 2 : segments.length >= 2;
  return sized && !segments.includes(FORGE_SEPARATOR) && !last.toLowerCase().endsWith('.json');
}

/** A URL that names a git repository, and whether its `.git` is still to be appended. */
function cloneForm(
  host: string,
  path: string,
  hasQuery: boolean,
): 'as-is' | 'append-git' | undefined {
  if (path.includes('/_git/')) return 'as-is';
  if (hasQuery) return undefined;
  if (path.endsWith('.git')) return 'as-is';
  return isForgeRepository(host, path) ? 'append-git' : undefined;
}

function fromHttp(text: string): Parsed | undefined {
  const parts = HTTP_URL.exec(text);
  if (parts === null) return undefined;
  const split = splitRef(text);
  const form = cloneForm(parts[2] ?? '', parts[3] ?? '', parts[4] !== undefined);
  if (split === undefined || form === undefined) return { kind: 'url', url: text };
  const base = split.base.replace(/\/+$/, '');
  return git(form === 'append-git' ? `${base}.git` : base, split.ref);
}

// ---- SSH and GitHub shorthand ----

const SSH = /^[^\s/@:]+@[^\s/@:]+:(?!\/\/)\S+$/;

function fromSsh(text: string): Parsed | undefined {
  if (!SSH.test(text)) return undefined;
  const split = splitRef(text);
  return split === undefined ? refused(UNRECOGNIZED) : git(split.base, split.ref);
}

const SHORTHAND_REF = /[#@]/;

function fromShorthand(text: string): Parsed | undefined {
  const slash = text.indexOf('/');
  if (slash < 0) return undefined;
  const rest = text.slice(slash + 1);
  const cut = rest.search(SHORTHAND_REF);
  const repo = cut < 0 ? rest : rest.slice(0, cut);
  const ref = cut < 0 ? undefined : rest.slice(cut + 1);
  const owner = text.slice(0, slash);
  if (!isGitHubRepository(owner, repo) || ref === '') {
    return refused(
      `"${text}" is not a valid owner/repo shorthand. Add https:// to use it as a URL, or give a local path`,
    );
  }
  return {
    kind: 'github',
    repo: `${owner}/${repo}`,
    path: DEFAULT_MARKETPLACE_PATH,
    ...(ref === undefined ? {} : { ref }),
  };
}

// ---- --sparse ----

/** Which sources take `--sparse`: "`github` and `git` sources only". */
const TAKES_SPARSE: { readonly [K in MarketplaceSource['kind']]: boolean } = {
  github: true,
  git: true,
  url: false,
  npm: false,
  file: false,
  directory: false,
  settings: false,
  'skills-dir': false,
  hostPattern: false,
  pathPattern: false,
};

const isCloned = (source: MarketplaceSource): source is MarketplaceSourceOf<'github' | 'git'> =>
  TAKES_SPARSE[source.kind];

function withSparse(parsed: Parsed, sparse: readonly string[] | undefined): Parsed {
  if (sparse === undefined || sparse.length === 0 || !('kind' in parsed)) return parsed;
  if (!isCloned(parsed)) return refused('--sparse applies to github and git sources only');
  return { ...parsed, sparsePaths: sparse };
}

/** The source the input stands for, or the issue that says it is none. */
export function parseMarketplaceInput(text: string, options: MarketplaceInputOptions = {}): Parsed {
  const input = text.trim();
  const platform = options.platform ?? 'posix';
  const parsed =
    (isPath(input, platform) ? pathSource(input) : undefined) ??
    fromHttp(input) ??
    fromSsh(input) ??
    fromShorthand(input) ??
    refused(UNRECOGNIZED);
  return withSparse(parsed, options.sparse);
}
