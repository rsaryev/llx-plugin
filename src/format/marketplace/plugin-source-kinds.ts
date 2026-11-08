import { error, type PluginIssue } from '../issues.ts';
import { defined } from './defined.ts';
import {
  invalidInput,
  isText,
  optionalDigest,
  optionalText,
  readGitPin,
  required,
  type RawSource,
  type SourceSite,
} from './plugin-source-fields.ts';
import type { PluginSource, PluginSourceKind } from './types.ts';

/**
 * The object plugin sources, one parser each (plugins/marketplace-reference.md, "Plugin sources"
 * and its sub-sections): the field rules the docs state. A parser returns the source, or the issues
 * that say why the object matches no type. What a field means at fetch time is the fetch plan's.
 */

export type ObjectKind = Exclude<PluginSourceKind, 'relative'>;
export type Parsed = PluginSource | readonly PluginIssue[];
export type ObjectParser = (raw: RawSource, site: SourceSite) => Parsed;

function github(raw: RawSource, site: SourceSite): Parsed {
  const repo = required(raw, 'repo');
  const pin = readGitPin(raw);
  if (repo === undefined || pin === undefined) return invalidInput(site);
  return { kind: 'github', repo, ...defined(pin) };
}

function url(raw: RawSource, site: SourceSite): Parsed {
  const address = required(raw, 'url');
  const pin = readGitPin(raw);
  if (address === undefined || pin === undefined) return invalidInput(site);
  return { kind: 'url', url: address, ...defined(pin) };
}

function gitSubdir(raw: RawSource, site: SourceSite): Parsed {
  const address = required(raw, 'url');
  const path = required(raw, 'path');
  const pin = readGitPin(raw);
  if (address === undefined || path === undefined || pin === undefined) return invalidInput(site);
  return { kind: 'git-subdir', url: address, path, ...defined(pin) };
}

/** "An `npm` `package` containing `..`" is `Invalid input` ("Invalid input on a source"). */
function npm(raw: RawSource, site: SourceSite): Parsed {
  const pkg = required(raw, 'package');
  const version = optionalText(raw, 'version');
  const registry = optionalText(raw, 'registry');
  if (pkg === undefined || version === undefined || registry === undefined) {
    return invalidInput(site);
  }
  if (pkg.includes('..')) return invalidInput(site);
  return {
    kind: 'npm',
    package: pkg,
    ...defined({ version: version.value, registry: registry.value }),
  };
}

function archive(raw: RawSource, site: SourceSite): Parsed {
  const address = required(raw, 'url');
  const sha256 = optionalDigest(raw);
  if (address === undefined || sha256 === undefined) return invalidInput(site);
  return { kind: 'archive', url: address, ...defined({ sha256: sha256.value }) };
}

const MAX_COMMAND_LENGTH = 500;
const PRINTABLE_ASCII = /^[\x20-\x7E]*$/;
const FOUR_SPACES = / {4}/;

/**
 * The rules for a command string ("command plugin source": "Write it as printable ASCII, at most
 * 500 characters, with no run of four or more spaces"), one report per rule broken. The docs give
 * the rules, not the wording of the refusal: the messages are the kit's (spec/judgments.md).
 */
export function commandTextIssues(command: string, path: string): PluginIssue[] {
  const found: PluginIssue[] = [];
  if (!PRINTABLE_ASCII.test(command)) {
    found.push(error(path, 'The command must be printable ASCII, so users can review all of it'));
  }
  if (command.length > MAX_COMMAND_LENGTH) {
    found.push(error(path, `The command may have at most ${MAX_COMMAND_LENGTH} characters`));
  }
  if (FOUR_SPACES.test(command)) {
    found.push(error(path, 'The command may not contain a run of four or more spaces'));
  }
  return found;
}

const DEFAULT_TIMEOUT_SECONDS = 60;
const MIN_TIMEOUT_SECONDS = 1;
const MAX_TIMEOUT_SECONDS = 600;

/** `timeout`: a whole number of seconds from 1 to 600, 60 when absent. */
function readTimeout(value: unknown): number | undefined {
  if (value === undefined) return DEFAULT_TIMEOUT_SECONDS;
  const whole = typeof value === 'number' && Number.isInteger(value);
  return whole && value >= MIN_TIMEOUT_SECONDS && value <= MAX_TIMEOUT_SECONDS ? value : undefined;
}

/** `mode`: `copy` (the default) or `link` ("Copy mode and link mode"). */
const readMode = (value: unknown): 'copy' | 'link' | undefined => {
  if (value === undefined) return 'copy';
  return value === 'copy' || value === 'link' ? value : undefined;
};

function readCommand(raw: RawSource, site: SourceSite): Parsed {
  const text = raw.command;
  const timeoutSeconds = readTimeout(raw.timeout);
  const mode = readMode(raw.mode);
  if (!isText(text) || timeoutSeconds === undefined || mode === undefined) {
    return invalidInput(site);
  }
  const broken = commandTextIssues(text, `${site.path}.command`);
  return broken.length > 0 ? broken : { kind: 'command', command: text, timeoutSeconds, mode };
}

/** One parser per object kind: a new `PluginSourceKind` fails the typecheck until it has one. */
export const OBJECT_PARSERS: { readonly [K in ObjectKind]: ObjectParser } = {
  github,
  url,
  'git-subdir': gitSubdir,
  npm,
  archive,
  command: readCommand,
};
