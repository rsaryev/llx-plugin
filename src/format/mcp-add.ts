import { error, warning, type PluginIssue } from './issues.ts';
import {
  completeMcpAdd,
  readAddScope,
  type McpAddOptions,
  type McpAddRead,
  type McpAddScope,
} from './mcp-add-json.ts';
import type { EnvLookup } from './mcp-env.ts';

/**
 * `claude mcp add [options] <name> -- <command> [args...]` and `claude mcp add --transport <type>
 * <name> <url>` (mcp.md, "Option 1" to "Option 3"): the arguments become the entry `add-json` would
 * have received. Everything after `--` is the server's own command line, "passed to the server
 * untouched". The CLI itself, its help and its exit codes are the host's.
 */
const TRANSPORTS = ['stdio', 'sse', 'http'] as const;
type CliTransport = (typeof TRANSPORTS)[number];

const isTransport = (text: string): text is CliTransport =>
  (TRANSPORTS as readonly string[]).includes(text);

interface Parsed {
  readonly values: { [flag: string]: string | undefined };
  readonly headers: string[];
  readonly env: Record<string, string>;
  readonly flags: Set<string>;
  readonly positionals: string[];
  after: string[] | undefined;
  readonly problems: PluginIssue[];
}

/** Flag spellings of the options that take one value, as `[long, short?]`. */
const VALUE_FLAGS: readonly (readonly [string, string?])[] = [
  ['--transport', '-t'],
  ['--scope', '-s'],
  ['--client-id'],
  ['--callback-port'],
];
const HEADER_FLAGS = ['--header', '-H'];
const ENV_FLAGS = ['--env', '-e'];
const SWITCHES = ['--client-secret'];

const longName = (token: string): string | undefined =>
  VALUE_FLAGS.find(([long, short]) => token === long || token === short)?.[0];

const problem = (message: string): PluginIssue => error('claude mcp add', message);

const newParsed = (): Parsed => ({
  values: {},
  headers: [],
  env: {},
  flags: new Set<string>(),
  positionals: [],
  after: undefined,
  problems: [],
});

/** Takes a flag that has a value; returns the index of the last token it used. */
function takeValue(argv: readonly string[], at: number, out: Parsed): number {
  const token = argv[at] ?? '';
  const value = longName(token);
  const next = argv[at + 1];
  if (next === undefined) out.problems.push(problem(`${token} needs a value`));
  else if (value === undefined) out.headers.push(next);
  else out.values[value] = next;
  return at + 1;
}

/** Takes `--env` and the `KEY=value` pairs that follow it. */
function takeEnv(argv: readonly string[], at: number, out: Parsed): number {
  let last = at;
  while (last + 1 < argv.length && !(argv[last + 1] ?? '').startsWith('-')) {
    addPair(out.env, argv[last + 1] ?? '', out.problems);
    last += 1;
  }
  return last;
}

/** Takes a switch, an unknown option or a positional. */
function takeOther(argv: readonly string[], at: number, out: Parsed): number {
  const token = argv[at] ?? '';
  if (SWITCHES.includes(token)) out.flags.add(token);
  else if (token.startsWith('-')) {
    out.problems.push(problem(`Unknown option ${token}: put the server's own flags after --`));
  } else out.positionals.push(token);
  return at;
}

const takesValue = (token: string): boolean =>
  longName(token) !== undefined || HEADER_FLAGS.includes(token);

function take(argv: readonly string[], at: number, out: Parsed): number {
  const token = argv[at] ?? '';
  if (takesValue(token)) return takeValue(argv, at, out);
  return ENV_FLAGS.includes(token) ? takeEnv(argv, at, out) : takeOther(argv, at, out);
}

/** Reads the argument list: flags anywhere before `--`, positionals in order, the rest after `--`. */
function parse(argv: readonly string[]): Parsed {
  const out = newParsed();
  let at = 0;
  while (at < argv.length) {
    if (argv[at] === '--') {
      out.after = argv.slice(at + 1);
      break;
    }
    at = take(argv, at, out) + 1;
  }
  return out;
}

/** `KEY=value`: the first `=` splits, so a value keeps its own. */
function pair(text: string): readonly [string, string] | undefined {
  const at = text.indexOf('=');
  return at > 0 ? [text.slice(0, at), text.slice(at + 1)] : undefined;
}

function addPair(into: Record<string, string>, text: string, problems: PluginIssue[]): void {
  const found = pair(text);
  if (found) {
    into[found[0]] = found[1];
    return;
  }
  const hint = `if "${text}" is the server name, put another option such as --transport stdio between --env and the name`;
  problems.push(problem(`--env takes KEY=value pairs and "${text}" is not one: ${hint}`));
}

function headers(texts: readonly string[], problems: PluginIssue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const text of texts) {
    const at = text.indexOf(':');
    if (at > 0) out[text.slice(0, at).trim()] = text.slice(at + 1).trim();
    else problems.push(problem(`--header takes "Name: value" and "${text}" is not one`));
  }
  return out;
}

type Entry = Record<string, unknown>;

/** One strategy per transport: the entry the arguments describe, or why they describe none. */
const ENTRIES: {
  readonly [T in CliTransport]: (parsed: Parsed, rest: readonly string[]) => Entry | string;
} = {
  stdio: ({ after, env }, rest) => {
    const [command, ...args] = after ?? rest;
    if (command === undefined) {
      return 'A stdio server needs a command: claude mcp add <name> -- <command> [args...]';
    }
    return {
      type: 'stdio',
      command,
      ...(args.length > 0 ? { args } : {}),
      ...(Object.keys(env).length > 0 ? { env } : {}),
    };
  },
  http: (parsed, rest) => remote('http', parsed, rest),
  sse: (parsed, rest) => remote('sse', parsed, rest),
};

function remote(type: 'http' | 'sse', parsed: Parsed, rest: readonly string[]): Entry | string {
  if (parsed.after !== undefined)
    return `Arguments after -- are a stdio server's command line, not a ${type} server's`;
  const [url, ...extra] = rest;
  if (url === undefined)
    return `A ${type} server needs a URL: claude mcp add --transport ${type} <name> <url>`;
  if (extra.length > 0) return `Unexpected arguments after the URL: ${extra.join(' ')}`;
  const sent = headers(parsed.headers, parsed.problems);
  return { type, url, ...(Object.keys(sent).length > 0 ? { headers: sent } : {}) };
}

/** `--client-id` and `--callback-port` as the `oauth` object of the entry. */
function oauthFlags(parsed: Parsed): Entry | undefined {
  const clientId = parsed.values['--client-id'];
  const port = parsed.values['--callback-port'];
  if (clientId === undefined && port === undefined) return undefined;
  return {
    ...(clientId === undefined ? {} : { clientId }),
    ...(port === undefined ? {} : { callbackPort: /^\d+$/.test(port) ? Number(port) : port }),
  };
}

const strayArguments = (rest: readonly string[], parsed: Parsed): string | undefined =>
  parsed.after !== undefined && rest.length > 0
    ? `Unexpected arguments before --: ${rest.join(' ')}`
    : undefined;

/** An add that is refused: the issues say why. */
const refusal = (
  name: string,
  scope: McpAddScope | undefined,
  issues: readonly PluginIssue[],
): McpAddRead => ({ name, scope, server: undefined, oauth: undefined, secret: undefined, issues });

/** The transport the flags name, or the issue that refuses it. */
function transportOf(parsed: Parsed): CliTransport | PluginIssue {
  const named = parsed.values['--transport'] ?? 'stdio';
  if (named === 'ws') {
    return problem(
      '--transport does not accept "ws": add a WebSocket server with claude mcp add-json',
    );
  }
  return isTransport(named)
    ? named
    : problem(`--transport must be one of ${TRANSPORTS.join(', ')}, not "${named}"`);
}

/** The entry the arguments describe, or the refusal's issues. */
function entryOf(
  parsed: Parsed,
  name: string,
  rest: readonly string[],
): { readonly entry: Entry; readonly transport: CliTransport } | readonly PluginIssue[] {
  if (name === '') return [problem('A server name is needed: claude mcp add [options] <name> ...')];
  const transport = transportOf(parsed);
  if (typeof transport !== 'string') return [transport];
  const built = strayArguments(rest, parsed) ?? ENTRIES[transport](parsed, rest);
  if (typeof built === 'string') return [problem(built), ...parsed.problems];
  if (parsed.problems.length > 0) return parsed.problems;
  const oauth = oauthFlags(parsed);
  return { entry: { ...built, ...(oauth === undefined ? {} : { oauth }) }, transport };
}

const isRefused = (made: ReturnType<typeof entryOf>): made is readonly PluginIssue[] =>
  Array.isArray(made);

/**
 * Reads the arguments after `claude mcp add`. Judgments (spec/judgments.md): no `--transport` means
 * stdio; without `--` the command is the positional after the name; `--header` on a stdio server and
 * the OAuth flags on a stdio one have no effect and say so; `ws` is refused with a pointer to
 * `add-json`, since "the `claude mcp add --transport` flag doesn't accept `ws`"; the wording of every
 * refusal is the kit's.
 */
export function readMcpAdd(argv: readonly string[], lookup: EnvLookup): McpAddRead {
  const parsed = parse(argv);
  const [name = '', ...rest] = parsed.positionals;
  const scope = readAddScope(name, parsed.values['--scope']);
  const known = typeof scope === 'string' ? scope : undefined;
  if (parsed.problems.length > 0) return refusal(name, known, parsed.problems);
  if (typeof scope !== 'string') return refusal(name, known, [scope]);
  const made = entryOf(parsed, name, rest);
  if (isRefused(made)) return refusal(name, known, made);
  const options: McpAddOptions = { clientSecret: parsed.flags.has('--client-secret') };
  const done = completeMcpAdd({ name, scope }, made.entry, options, lookup);
  const useless = made.transport === 'stdio' && parsed.headers.length > 0;
  return useless
    ? {
        ...done,
        issues: [
          ...done.issues,
          warning('claude mcp add', '--header has no effect on a stdio server'),
        ],
      }
    : done;
}
