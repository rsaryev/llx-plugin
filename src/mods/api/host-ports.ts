import type { Clock, CommandRunner, Locations, McpCaller } from '../../ports/index.ts';
import type { ModStore, TelemetrySink } from '../ports.ts';
import type {
  ModAccount,
  ModAgents,
  ModAudio,
  ModCommands,
  ModConfig,
  ModEnv,
  ModFetcher,
  ModFs,
  ModModels,
  ModNotifications,
  ModPromptBox,
  ModPrompts,
  ModSession,
  ModSettingsReader,
  ModSpawner,
  ModTheme,
  ModTools,
  ModTurns,
  PromptPainted,
} from './ports.ts';

/**
 * The ports `createModsHost` takes, by group (docs/API.md, "Mods"). A host gives the platform and
 * session ports; it may leave out the optional ones, and `withDefaultPorts` fills each with the
 * answer the declarations give where that capability is missing (declarations 2.1.321, AGENTS.md E2a).
 */

/**
 * The ports of the machine the session runs on: time, paths, files, processes, the network, the
 * environment and a plugin's store. Every host gives them.
 */
export interface ModPlatformPorts {
  readonly clock: Clock;
  readonly locations: Locations;
  readonly fs: ModFs;
  readonly runner: CommandRunner;
  readonly spawner: ModSpawner;
  readonly fetcher: ModFetcher;
  readonly env: ModEnv;
  readonly store: ModStore;
}

/** The ports of the session itself: its transcript, turns, prompts, agents, commands, tools, models and settings. */
export interface ModSessionPorts {
  readonly models: ModModels;
  readonly session: ModSession;
  readonly prompts: ModPrompts;
  readonly agents: ModAgents;
  readonly commands: ModCommands;
  readonly tools: ModTools;
  readonly turns: ModTurns;
  readonly config: ModConfig;
  readonly settings: ModSettingsReader;
}

/**
 * The ports a host may leave out: the declarations say what each call answers where the capability
 * is missing (`OPTIONAL_PORT_DEFAULTS`): no audio player or synthesizer, no MCP server connected, no
 * app that draws a backdrop, telemetry the engine itself does nothing with, no sign-in to tell, a
 * prompt box that takes no decorations and holds no media, and no host that raises notifications.
 */
export interface ModOptionalPorts {
  readonly mcp: McpCaller;
  readonly audio: ModAudio;
  readonly theme: ModTheme;
  readonly telemetry: TelemetrySink;
  /** `$.session.identity()` (claude-code/index.d.ts:3081). */
  readonly account: ModAccount;
  /** `$.prompt.paint` and `$.prompt.media` (:3168, :3143). */
  readonly promptBox: ModPromptBox;
  /** `$.ui.cancelNotify` (:2536). */
  readonly notifications: ModNotifications;
}

/** Every port the mods API reaches, as the kit holds them once the optional ones are filled. */
export interface ModHostPorts extends ModPlatformPorts, ModSessionPorts, ModOptionalPorts {}

/** What a host gives `createModsHost`: the platform and session ports, and any of the optional ones. */
export type ModHostPortsInput = ModPlatformPorts & ModSessionPorts & Partial<ModOptionalPorts>;

const noSynthesizer = (): Promise<never> =>
  Promise.reject(new Error('$.audio.speak: there is no synthesizer'));

/**
 * A box that takes no decorations: `isPainted: false`, "the box handed back" (:3160), as `read`
 * answers it; `''` and 0 "where no box is drawn" (:9793).
 */
const unpainted =
  (read: () => Promise<{ readonly text: string; readonly cursor: number }>) =>
  async (): Promise<PromptPainted> => {
    const { text, cursor } = await read();
    return { isPainted: false, text, cursor };
  };
const noBox = (): Promise<{ text: string; cursor: number }> =>
  Promise.resolve({ text: '', cursor: 0 });

/** A box that holds no media: "no submission in flight carries the id" (:9504). */
const NO_MEDIA = { deny: 'no submission in flight carries this id' } as const;

const promptBoxOver = (
  read: () => Promise<{ readonly text: string; readonly cursor: number }>,
): ModPromptBox =>
  Object.freeze({ paint: unpainted(read), media: () => Promise.resolve(NO_MEDIA) });

/**
 * What a missing optional port answers (claude-code/index.d.ts): `$.audio.play` plays nothing and
 * resolves, "having no player" (:2814); `$.audio.speak` "rejects, naming the cause, when there is no
 * synthesizer" (:2828); `$.mcp.call` reaches "connected MCP servers" and none is (:2849);
 * `$.theme.set` resolves "`isDrawn: false` and why" (:2711); for `$.telemetry` "The engine does
 * nothing with it" (:3350), the hooks alone do; `$.session.identity` answers `kind` `none`, "a
 * session with no identity", not verified (:12154, :12187); `$.prompt.paint` paints nothing and
 * `$.prompt.media` holds nothing (`promptBoxOver`); `$.ui.cancelNotify` reaches no host that raises
 * notifications, `isSent: false` (:2534).
 */
export const OPTIONAL_PORT_DEFAULTS: ModOptionalPorts = Object.freeze({
  audio: Object.freeze({ play: () => Promise.resolve(), speak: noSynthesizer }),
  mcp: Object.freeze({
    ensureConnected: () => Promise.resolve('unavailable' as const),
    callTool: () => Promise.reject(new Error('$.mcp.call: no MCP server is connected')),
  }),
  theme: Object.freeze({
    drawn: () =>
      Promise.resolve({
        isDrawn: false as const,
        reason: 'no Desktop or mobile app that draws backdrops is connected to the session',
      }),
    changed: () => undefined,
  }),
  telemetry: Object.freeze({ log: () => Promise.resolve(), mark: () => Promise.resolve() }),
  account: Object.freeze({
    identity: () => Promise.resolve({ kind: 'none', isVerified: false }),
  }),
  promptBox: promptBoxOver(noBox),
  notifications: Object.freeze({ cancel: () => Promise.resolve({ isSent: false }) }),
});

/** `given` with each optional port it left out filled from `OPTIONAL_PORT_DEFAULTS`. */
export const withDefaultPorts = (given: ModHostPortsInput): ModHostPorts => ({
  ...given,
  audio: given.audio ?? OPTIONAL_PORT_DEFAULTS.audio,
  mcp: given.mcp ?? OPTIONAL_PORT_DEFAULTS.mcp,
  theme: given.theme ?? OPTIONAL_PORT_DEFAULTS.theme,
  telemetry: given.telemetry ?? OPTIONAL_PORT_DEFAULTS.telemetry,
  account: given.account ?? OPTIONAL_PORT_DEFAULTS.account,
  promptBox: given.promptBox ?? promptBoxOver(() => given.prompts.read()),
  notifications: given.notifications ?? OPTIONAL_PORT_DEFAULTS.notifications,
});
