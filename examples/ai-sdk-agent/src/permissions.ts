/**
 * The permission rules of the session, read the way Claude Code reads them (permissions.md,
 * "Settings precedence"): `~/.claude/settings.json`, then the project's `.claude/settings.json` and
 * `.claude/settings.local.json`. `session.checkTool` decides each tool call against them after the
 * plugins' `PreToolUse` hooks, over the input those hooks return.
 *
 * The agent runs like `claude -p`: there is no one to answer a prompt, so an `ask` is a refusal.
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  createPermissionsPolicy,
  createPolicyView,
  decide,
  policyContext,
  readSettingsLayer,
  startPermissions,
  type DecideContext,
  type Decision,
  type PluginIssue,
  type PolicyView,
} from '@rsaryev/claude-plugin-kit';
import { parseRule } from '@rsaryev/claude-plugin-kit/rules';
import type { ShellPermission } from '@rsaryev/claude-plugin-kit/skills';

export interface Permissions {
  readonly view: PolicyView;
  readonly mode: DecideContext['mode'];
  readonly context: DecideContext;
  readonly issues: readonly PluginIssue[];
}

async function jsonAt(path: string): Promise<unknown> {
  const text = await readFile(path, 'utf8').catch(() => undefined);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    // A file that is no JSON is reported by `readSettingsLayer` as a broken source.
    return text;
  }
}

/** The rules of `cwd`, started in `permissionMode` (`--permission-mode`). */
export async function loadPermissions(cwd: string, permissionMode: string): Promise<Permissions> {
  const home = homedir();
  const sources = [
    ['user', join(home, '.claude', 'settings.json')],
    ['project', join(cwd, '.claude', 'settings.json')],
    ['local', join(cwd, '.claude', 'settings.local.json')],
  ] as const;
  const read = await Promise.all(
    sources.map(async ([scope, path]) => readSettingsLayer(scope, await jsonAt(path), path)),
  );
  const view = createPolicyView(read.map((layer) => layer.layer));
  // `claude -p` skips the trust dialog, so the working folder counts as trusted here.
  const facts = policyContext({ env: process.env, isFolderTrusted: () => true });
  const started = startPermissions({
    policy: createPermissionsPolicy(view, facts),
    start: { surface: 'headless', autoAvailable: false, permissionMode },
    paths: {
      cwd,
      home,
      primaryWorkingDirectory: cwd,
      additionalDirectories: [],
      platform: process.platform === 'win32' ? 'windows' : 'posix',
    },
  });
  if (started.outcome === 'refused') throw new Error(started.reason);
  return {
    view,
    mode: started.mode,
    context: started.context,
    issues: [...read.flatMap((layer) => layer.issues), ...started.issues],
  };
}

const BEHAVIOR: { readonly [O in Decision['outcome']]: Awaited<ReturnType<ShellPermission>> } = {
  allow: 'allow',
  deny: 'deny',
  ask: 'ask',
  // Auto mode is off in this agent; were it on, its review would be the host's to run.
  classify: 'ask',
};

/** `context` with `grants` (a skill's `allowed-tools`) added as allow rules: deny and ask rules still win. */
export function withGrants(context: DecideContext, grants: readonly string[]): DecideContext {
  const granted = grants.flatMap((text) => {
    const { rule } = parseRule(text, { behavior: 'allow', source: { kind: 'session' } });
    return rule === undefined ? [] : [rule];
  });
  return granted.length === 0 ? context : { ...context, rules: [...context.rules, ...granted] };
}

/**
 * The rules in force during a turn (skills.md, `allowed-tools`: "Tools Claude can use without
 * asking permission during the turn that invokes this skill. The grant clears when you send your
 * next message."). The kit's expansion returns the grants; holding them for the turn is the host's.
 */
export interface TurnPermissions {
  current(): DecideContext;
  grant(grants: readonly string[]): void;
  newTurn(): void;
}

export function turnPermissions(base: DecideContext): TurnPermissions {
  let grants: string[] = [];
  return {
    current: () => withGrants(base, grants),
    grant: (more) => {
      grants = [...grants, ...more];
    },
    newTurn: () => {
      grants = [];
    },
  };
}

/**
 * The answer for a skill's `` !`command` `` placeholder (skills.md, "Inject dynamic context"): the
 * rules, with the skill's `allowed-tools` added as allow rules ("Deny and ask rules still override
 * `allowed-tools`"). An `ask` aborts the expansion, since no one can answer here.
 */
export function shellPermission(context: DecideContext): ShellPermission {
  return ({ tool, command, grants }) =>
    BEHAVIOR[decide({ toolName: tool, input: { command } }, withGrants(context, grants)).outcome];
}
