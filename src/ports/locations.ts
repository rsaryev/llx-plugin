/**
 * Where things are on the host: the values behind `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA` and
 * `CLAUDE_PROJECT_DIR`, and path joining, which differs between hosts (`/` or `\`). The kit never
 * concatenates a path itself. A plugin is named by the id the host uses for it
 * (`name@marketplace`, or the bare name for a plugin loaded from a directory).
 */
export interface Locations {
  /** `~`: the home directory (user agent memory, user skills). */
  homeDir(): string;
  /** The project folder, `CLAUDE_PROJECT_DIR`. */
  projectDir(): string;
  /** The folder the plugin was loaded from, `CLAUDE_PLUGIN_ROOT`. */
  pluginRoot(pluginId: string): string;
  /**
   * The plugin's persistent data folder, `CLAUDE_PLUGIN_DATA`. The docs create it the first time
   * it is referenced, so a host may create it here.
   */
  pluginData(pluginId: string, signal?: AbortSignal): Promise<string>;
  /** `base` and a relative path (`/`-separated) joined the way this host writes paths. */
  joinPath(base: string, relativePath: string): string;
  /** The first candidate that is an existing directory, or `undefined`. */
  existingDirectory(
    candidates: readonly string[],
    signal?: AbortSignal,
  ): Promise<string | undefined>;
}
