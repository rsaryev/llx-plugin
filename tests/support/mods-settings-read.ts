/** What the `settings.read` tests share: the layers a session holds, and Claude Code's own read through a chain. */
import { readEngineSettings, type SettingsLayer } from '../../src/mods/api/index.ts';
import { apiHarness } from './mods-api.ts';

export const LAYERS: readonly SettingsLayer[] = [
  { source: 'plugin', settings: { outputStyle: 'terse' } },
  { source: 'user', settings: { spinnerTipsEnabled: true, model: 'haiku' } },
  { source: 'project', settings: { model: 'sonnet' } },
  { source: 'policy', settings: { disableAllHooks: false } },
];

/** The host merges by precedence: later layers win, key by key. */
const merged = (layers: readonly SettingsLayer[]) =>
  Object.assign({}, ...layers.map((layer) => layer.settings));
export const settings = (layers = LAYERS) => ({ layers: () => Promise.resolve(layers), merged });

export const ORIGIN = { plugin: 'engine', tier: 'core' };

/** Claude Code's own read of the session's settings, with hooks registered by `hooks`. */
export async function engineRead(
  hooks: Parameters<Awaited<ReturnType<typeof apiHarness>>['mod']>[2],
  options: {
    afterMine?: readonly [string, 'prepend' | 'user', typeof hooks][];
    fits?: (key: string, value: unknown) => boolean;
    mods?: readonly [string, 'prepend' | 'user', typeof hooks][];
  } = {},
) {
  const h = await apiHarness({ ports: { settings: settings() } });
  for (const [name, tier, registered] of options.mods ?? []) await h.mod(name, tier, registered);
  await h.mod('my-mod', 'user', hooks);
  for (const [name, tier, registered] of options.afterMine ?? [])
    await h.mod(name, tier, registered);
  const debug: string[] = [];
  const reports: string[] = [];
  const value = await readEngineSettings({
    chain: h.chain,
    settings: settings(),
    fits: options.fits ?? (() => true),
    signal: new AbortController().signal,
    report: (report) => reports.push(report.line),
    debug: (line) => debug.push(line),
  });
  return { value, debug, reports };
}

export const MERGED = {
  outputStyle: 'terse',
  spinnerTipsEnabled: true,
  model: 'sonnet',
  disableAllHooks: false,
};
