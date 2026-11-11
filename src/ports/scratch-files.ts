/**
 * Somewhere to put text the kit may not inline: a hook string over the cap is spilled to a file
 * and the model is told where it is (hooks.md, "Output caps"), as are over-long tool results.
 */
export interface ScratchFiles {
  /** Store `content` under a name derived from `name`; returns the path to tell the model. */
  write(name: string, content: string, signal?: AbortSignal): Promise<string>;
}
