/**
 * Where the three settings files a person edits live, as settings.md writes them ("Settings files"):
 * the user file under the configuration folder, the project and local files under `.claude/` of the
 * project. One spelling for every message, label and path the kit builds from them.
 */
export const SETTINGS_FILE = {
  /** The user file's name inside the configuration folder (`~/.claude` or `CLAUDE_CONFIG_DIR`). */
  userName: 'settings.json',
  /** The user file as the docs write it. */
  user: '~/.claude/settings.json',
  /** The project file, relative to the project folder. */
  project: '.claude/settings.json',
  /** The local file, relative to the folder it stays in. */
  local: '.claude/settings.local.json',
} as const;
