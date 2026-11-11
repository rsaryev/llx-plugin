/**
 * `bun run oracle:settings`: the kit's settings merge against the Agent SDK's own resolver
 * (`resolveSettings`, `filterEscalatingDefaultMode`, both `@alpha`, pure JS that spawns nothing), for
 * the cases of `settings-cases.ts`; for the starting mode also against `claude` itself, run as a
 * black box isolated like the runtime oracle and ended at `init`. HOME and the config folder point
 * at a private folder, so no person's settings play a part. The machine's managed settings file
 * cannot be moved: the SDK always reads it, so the kit is handed the same file (MDM profiles are not).
 * Exits 1 on a difference that is not known, and on a known one that no longer differs.
 */
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPermissionsPolicy, createPolicyView, type PolicyContext } from '../../src/index.ts';
import { loadSettingsLayers } from '../../src/entry/settings.ts';
import { SETTINGS_CASES, type SettingsCase } from './settings-cases.ts';
import { CLAUDE_BIN } from './claude-bin.ts';

const scratch = await mkdtemp(join(tmpdir(), 'settings-oracle-'));
process.env.HOME = join(scratch, 'home');
process.env.CLAUDE_CONFIG_DIR = join(scratch, 'config');
// Imported after HOME moves, so the resolver never reads the person's user settings.
const { filterEscalatingDefaultMode, resolveSettings } =
  await import('@anthropic-ai/claude-agent-sdk');

const MACHINE_DIR =
  process.platform === 'darwin' ? '/Library/Application Support/ClaudeCode' : '/etc/claude-code';

/** The machine's managed-settings.json and managed-settings.d/, as the kit's port takes them. */
async function machineManaged() {
  const read = async (path: string) => ({ value: JSON.parse(await readFile(path, 'utf8')) });
  const base = join(MACHINE_DIR, 'managed-settings.json');
  const folder = join(MACHINE_DIR, 'managed-settings.d');
  const names = existsSync(folder) ? (await readdir(folder)).toSorted() : [];
  const files = await Promise.all(
    names.map(async (name) => ({ name, read: await read(join(folder, name)) })),
  );
  return {
    present: existsSync(base) || files.length > 0,
    reads: { file: { base: existsSync(base) ? await read(base) : undefined, dropIns: { files } } },
  };
}
const machine = await machineManaged();

const context: PolicyContext = {
  account: 'claudeaiPersonal',
  plan: { pro: false },
  hasManagedSettings: machine.present,
  parentMerge: false,
  isFolderTrusted: () => true,
  env: {},
  defaultChannelAllowlist: [],
  officialMarketplaces: ['claude-plugins-official'],
};

/** A value with object keys sorted and every list as a sorted set: the order carries no behaviour. */
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    const items = value.map(canonical).map((item) => JSON.stringify(item));
    return [...new Set(items)].toSorted().map((item) => JSON.parse(item));
  }
  if (value === null || typeof value !== 'object') return value;
  const entries = Object.entries(value).map(([key, inner]) => [key, canonical(inner)] as const);
  return Object.fromEntries(entries.toSorted(([a], [b]) => a.localeCompare(b)));
};
const shown = (value: unknown): string => JSON.stringify(canonical(value)) ?? 'undefined';
const text = (file: unknown): string => (typeof file === 'string' ? file : JSON.stringify(file));
const modeOf = (value: unknown): string =>
  value === 'manual' || typeof value !== 'string' || value === '' ? 'default' : value;

/** The case's files on disk: user in the config folder, project and local in a project folder. */
async function writeCase(one: SettingsCase, dir: string): Promise<Record<string, string>> {
  await rm(dir, { recursive: true, force: true });
  await mkdir(join(dir, 'config'), { recursive: true });
  await mkdir(join(dir, 'project', '.claude'), { recursive: true });
  const paths = {
    user: join(dir, 'config', 'settings.json'),
    project: join(dir, 'project', '.claude', 'settings.json'),
    local: join(dir, 'project', '.claude', 'settings.local.json'),
  };
  const raws: Record<string, string> = {};
  for (const [tier, path] of Object.entries(paths)) {
    const file = one[tier as keyof typeof paths];
    if (file === undefined) continue;
    raws[tier] = text(file);
    await writeFile(path, raws[tier]);
  }
  if (one.parent !== undefined) raws.parent = text(one.parent);
  return raws;
}

/** The SDK resolver's value of each key, and the mode it would start in. */
async function sdkSide(one: SettingsCase, dir: string): Promise<Record<string, string>> {
  process.env.CLAUDE_CONFIG_DIR = join(dir, 'config');
  const resolved = await resolveSettings({
    cwd: join(dir, 'project'),
    settingSources: ['user', 'project', 'local'],
    ...(one.parent !== undefined && { managedSettings: one.parent as never }),
  });
  const effective: Record<string, unknown> = resolved.effective;
  const filtered = filterEscalatingDefaultMode(resolved);
  return Object.fromEntries(
    one.keys.map((key) => [
      key,
      key === 'defaultMode' ? modeOf(filtered.permissions?.defaultMode) : shown(effective[key]),
    ]),
  );
}

/** The kit's value of each key, and the mode a headless session starts in. */
async function kitSide(
  one: SettingsCase,
  raws: Record<string, string>,
): Promise<Record<string, string>> {
  const loaded = await loadSettingsLayers(
    { read: async (scope) => raws[scope], managed: async () => machine.reads },
    { signal: new AbortController().signal },
  );
  const view = createPolicyView(loaded.layers);
  const start = createPermissionsPolicy(view, context).startingMode({
    surface: 'headless',
    autoAvailable: true,
  });
  const started = start.outcome === 'started' ? start.mode : `refused`;
  return Object.fromEntries(
    one.keys.map((key) => [key, key === 'defaultMode' ? started : shown(view.get(key as never))]),
  );
}

/** The mode `claude -p` starts in for the case's files, read from `init`; undefined without claude. */
async function cliMode(dir: string): Promise<string | undefined> {
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--max-turns', '1'];
  const run = Bun.spawn([CLAUDE_BIN, ...args, '--setting-sources', 'user,project,local', 'hi'], {
    cwd: join(dir, 'project'),
    env: {
      PATH: process.env.PATH ?? '',
      HOME: join(scratch, 'home'),
      CLAUDE_CONFIG_DIR: join(dir, 'config'),
      ANTHROPIC_API_KEY: 'sk-ant-invalid-for-oracle',
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:9',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    },
    stdout: 'pipe',
    stderr: 'ignore',
  });
  let pending = '';
  const decoder = new TextDecoder();
  for await (const chunk of run.stdout) {
    pending += decoder.decode(chunk, { stream: true });
    const init = pending.split('\n').find((line) => line.includes('"subtype":"init"'));
    if (init === undefined) continue;
    run.kill();
    return modeOf(JSON.parse(init).permissionMode);
  }
  return undefined;
}

const hasClaude = Bun.which('claude') !== null;
let failures = 0;
for (const [index, one] of SETTINGS_CASES.entries()) {
  const dir = join(scratch, `case-${index}`);
  const raws = await writeCase(one, dir);
  const [sdk, kit] = [await sdkSide(one, dir), await kitSide(one, raws)];
  const differs = one.keys.filter((key) => sdk[key] !== kit[key]);
  const cli = hasClaude && one.keys.includes('defaultMode') ? await cliMode(dir) : undefined;
  const cliDiffers = cli !== undefined && cli !== kit.defaultMode;
  const sdkVerdict = differs.length === 0 ? 'agrees' : one.known ? 'known' : 'DIFFERS';
  const stale = one.known !== undefined && differs.length === 0;
  if (sdkVerdict === 'DIFFERS' || stale || cliDiffers) failures++;
  const cliNote = cli === undefined ? '' : cliDiffers ? `  cli=DIFFERS(${cli})` : '  cli=agrees';
  console.log(`${one.name}: sdk=${stale ? 'STALE known' : sdkVerdict}${cliNote}`);
  for (const key of differs) console.log(`    ${key}: sdk ${sdk[key]} kit ${kit[key]}`);
  if (one.known && differs.length > 0) console.log(`    (${one.known})`);
}
await rm(scratch, { recursive: true, force: true });
console.log(
  `\n${SETTINGS_CASES.length} cases, ${failures} failing${hasClaude ? '' : ' (claude not installed: no CLI check)'}`,
);
process.exit(failures > 0 ? 1 : 0);
