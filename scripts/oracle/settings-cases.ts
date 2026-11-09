/**
 * The inputs of the settings oracle (`settings.ts`): the files of each case, the keys compared, and
 * for a case where the kit is known to differ from the SDK's resolver, why (a judgment, or the docs).
 * A list compares as a set: the kit and the SDK concatenate tiers in opposite orders, and the order
 * carries no behaviour (spec/judgments.md, `src/settings/merge.ts` and `src/settings/hooks-merge.ts`).
 */

/** One settings file: a JSON value, or raw text (a broken file). */
type File = unknown;

export interface SettingsCase {
  readonly name: string;
  readonly user?: File;
  readonly project?: File;
  readonly local?: File;
  /** The SDK's `managedSettings` option; the kit's `parent` scope. */
  readonly parent?: File;
  /** Top-level keys compared, or `defaultMode` for the mode a session starts in. */
  readonly keys: readonly string[];
  /** Why the kit differs here; the oracle fails when a case so marked agrees. */
  readonly known?: string;
}

const hook = (command: string) => ({ hooks: [{ type: 'command', command }] });
const mode = (value: string) => ({ permissions: { defaultMode: value } });
const MODE = ['defaultMode'];

export const SETTINGS_CASES: readonly SettingsCase[] = [
  {
    name: 'project beats user',
    user: { model: 'opus' },
    project: { model: 'haiku' },
    keys: ['model'],
  },
  {
    name: 'local beats project beats user',
    user: { model: 'a' },
    project: { model: 'b' },
    local: { model: 'c' },
    keys: ['model'],
  },
  {
    name: 'permission lists combine',
    user: { permissions: { allow: ['Read', 'Bash(ls:*)'], deny: ['Bash(rm:*)'] } },
    project: { permissions: { allow: ['Edit'], deny: ['Write'] } },
    local: { permissions: { ask: ['Bash(git push:*)'] } },
    keys: ['permissions'],
  },
  {
    name: 'env merges per variable',
    user: { env: { A: '1', B: 'u' } },
    project: { env: { B: 'p', C: '3' } },
    local: { env: { C: 'l' } },
    keys: ['env'],
  },
  {
    name: 'hooks combine per event',
    user: { hooks: { PreToolUse: [{ matcher: 'Bash', ...hook('u.sh') }] } },
    project: {
      hooks: { PreToolUse: [{ matcher: 'Bash', ...hook('p.sh') }], Stop: [hook('s.sh')] },
    },
    keys: ['hooks'],
  },
  {
    name: 'enabledPlugins combine per id',
    user: { enabledPlugins: { 'a@m': true, 'b@m': true } },
    project: { enabledPlugins: { 'b@m': false, 'c@m': true } },
    keys: ['enabledPlugins'],
  },
  {
    name: 'extraKnownMarketplaces combine per name',
    user: { extraKnownMarketplaces: { m1: { source: { source: 'github', repo: 'a/b' } } } },
    project: {
      extraKnownMarketplaces: {
        m1: { source: { source: 'github', repo: 'c/d' } },
        m2: { source: { source: 'github', repo: 'e/f' } },
      },
    },
    keys: ['extraKnownMarketplaces'],
  },
  {
    name: 'sandbox merges nested',
    user: { sandbox: { enabled: true, network: { allowedDomains: ['a.com'] } } },
    project: { sandbox: { network: { allowedDomains: ['b.com'] }, excludedCommands: ['git'] } },
    keys: ['sandbox'],
  },
  {
    name: 'MCP server lists combine',
    user: { disabledMcpjsonServers: ['a'] },
    project: { disabledMcpjsonServers: ['b'], enabledMcpjsonServers: ['x'] },
    keys: ['disabledMcpjsonServers', 'enabledMcpjsonServers'],
  },
  {
    name: 'a broken file is skipped',
    user: { model: 'opus' },
    project: '{ "model": ',
    keys: ['model'],
  },
  {
    name: 'a wrong-typed value is dropped',
    user: { model: 5, permissions: 'x' },
    keys: ['model', 'permissions'],
  },
  {
    name: 'an env of no text values',
    user: { env: { A: 1 } },
    keys: ['env'],
    known:
      'settings-reference.md types env values as strings, so the kit drops a number with a warning; resolveSettings and claude 2.1.321 set it as its text (String(value), also for null and objects)',
  },
  {
    name: 'a key the project cannot set',
    project: { skipDangerousModePermissionPrompt: true },
    keys: ['skipDangerousModePermissionPrompt'],
    known:
      'settings-reference.md scopes the key to user, local and managed; resolveSettings merges it raw',
  },
  {
    name: 'parent settings keep the restrictive keys',
    parent: { permissions: { deny: ['Bash(curl:*)'] }, model: 'x' },
    user: { permissions: { allow: ['Read'] } },
    keys: ['permissions', 'model'],
  },
  {
    name: 'parent allowManagedHooksOnly',
    parent: { allowManagedHooksOnly: true },
    user: { hooks: { Stop: [hook('x')] } },
    keys: ['allowManagedHooksOnly', 'hooks'],
  },
  ...['user', 'project', 'local'].flatMap((tier) =>
    ['default', 'acceptEdits', 'plan', 'dontAsk', 'auto', 'bypassPermissions', 'manual'].map(
      (value): SettingsCase => ({
        name: `defaultMode ${value} from ${tier}`,
        [tier]: mode(value),
        keys: MODE,
        ...(tier === 'project' &&
          value === 'acceptEdits' && {
            known:
              'filterEscalatingDefaultMode drops acceptEdits from project settings; claude 2.1.321 starts in acceptEdits, as permissions.md names only auto and bypassPermissions',
          }),
      }),
    ),
  ),
  {
    name: 'defaultMode plan from project over auto from user',
    user: mode('auto'),
    project: mode('plan'),
    keys: MODE,
  },
  { name: 'defaultMode of no mode', user: mode('banana'), keys: MODE },
];
