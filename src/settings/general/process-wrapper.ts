import type { PolicyView } from '../view.ts';

/**
 * The launcher of `processWrapper` and `CLAUDE_CODE_PROCESS_WRAPPER` (settings-reference.md,
 * `processWrapper`; corporate-launcher.md, "Format of the launcher value"). Both take the same format:
 * "Claude Code parses the value as an argument list, not a shell command".
 */
const PROCESS_WRAPPER_ENV = 'CLAUDE_CODE_PROCESS_WRAPPER';

export type LauncherRead =
  | { readonly argv: readonly string[] }
  /** The value cannot be used: Claude Code "refuses to start the affected process" and reports this. */
  | { readonly problem: string };

const OPERATORS = /[;|&]|\$\(/;
const fail = (reason: string): LauncherRead => ({ problem: `${PROCESS_WRAPPER_ENV}: ${reason}` });

/** A value that starts with `[` is "read as a JSON string array". */
function jsonArray(value: string): LauncherRead {
  try {
    const parsed: unknown = JSON.parse(value);
    const isArgv = Array.isArray(parsed) && parsed.every((one) => typeof one === 'string');
    return isArgv && parsed.length > 0
      ? { argv: parsed }
      : fail('the launcher is not a non-empty JSON array of strings');
  } catch {
    return fail('the launcher is not a valid JSON array of strings');
  }
}

/** Unquoted operators are rejected; quoted operators are ordinary argument text. */
function hasShellOperator(value: string): boolean {
  const unquoted = value.replace(/"[^"]*"/g, '');
  return OPERATORS.test(unquoted);
}

/** Whitespace separates tokens, double quotes group; a single quote is an ordinary character. */
function tokens(value: string): LauncherRead {
  if (hasShellOperator(value))
    return fail('the launcher holds a shell operator; write an argument list');
  if ((value.match(/"/g)?.length ?? 0) % 2 !== 0)
    return fail('the launcher has an unterminated double quote');
  const found =
    value.match(/(?:[^\s"]|"[^"]*")+/g)?.map((token) => token.replaceAll('"', '')) ?? [];
  return found.length === 0 ? fail('the launcher is empty') : { argv: found };
}

/** The argv prefix a launcher value stands for, or why it cannot be used. */
function parseLauncher(value: string): LauncherRead {
  const text = value.trim();
  return text.startsWith('[') ? jsonArray(text) : tokens(text);
}

/** The per-session launcher, ignored on Windows. */
export function readProcessWrapper(
  view: PolicyView,
  options: {
    readonly env: Readonly<Record<string, string | undefined>>;
    readonly windows: boolean;
  },
): LauncherRead | undefined {
  if (options.windows) return undefined;
  const value = options.env[PROCESS_WRAPPER_ENV] ?? view.get('processWrapper');
  return value === undefined ? undefined : parseLauncher(value);
}
