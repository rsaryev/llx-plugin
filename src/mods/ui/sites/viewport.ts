import type { Surface } from '../../../protocol/mods-ui-names.ts';

/** `e.viewport`: `columns`, `rows` and `isFullscreen`. */
export interface Viewport {
  readonly columns: number;
  readonly rows: number;
  readonly isFullscreen: boolean;
}

/** The apps whose viewport is present from the start; the others measure their window first. */
const ALWAYS_MEASURED: { readonly [S in Surface]: boolean } = {
  terminal: false,
  desktop: false,
  vscode: true,
};

/**
 * `e.viewport` "is absent until the app has measured its window" in the terminal and the Desktop
 * app, and "always present" in the VS Code extension (reference.md, "Render sites").
 */
export const viewportProblem = (
  surface: Surface,
  viewport: Viewport | undefined,
): string | undefined =>
  ALWAYS_MEASURED[surface] && viewport === undefined
    ? 'the VS Code extension always has a viewport'
    : undefined;
