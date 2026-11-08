/** The line a skill's text opens with, its folder after it. */
export const BASE_DIRECTORY = 'Base directory for this skill: ';

/**
 * The text the model receives: a skill's opens with its folder and a blank line, a command's (no
 * folder) is the body alone (Claude Code 2.1.319, `bun run oracle:model-content`; the docs do not
 * show the line).
 */
export const withFolderLine = (text: string, dir: string | undefined): string =>
  dir === undefined ? text : `${BASE_DIRECTORY}${dir}\n\n${text}`;
