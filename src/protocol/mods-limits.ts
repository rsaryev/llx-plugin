/**
 * Every number of the mods reference's Limits table (plugins/mods/reference.md, "Limits") as a named
 * constant, so no module of the kit writes one of them as a literal. Pure data: what each limit
 * does is the code of the module that owns the limited behaviour.
 */
const MIB = 1024 * 1024;

export const MOD_LIMITS = {
  /** A hook's own execution time for one event, not counting time inside `next` or a mods API call other than `$.clock.sleep`. */
  hookMs: 10_000,
  /** The same limit for a `prompt.edit` hook. */
  promptEditMs: 50,
  /** A `.catch` handler's own execution time. */
  catchMs: 1000,
  /** All `session.end` hooks together, unless the SessionEnd hook budget is changed (hooks.md, "SessionEnd input"). */
  sessionEndMs: 1500,
  /** `$.process.run` timeout by default, and at most. */
  runTimeoutMs: 30_000,
  runTimeoutMaxMs: 600_000,
  /** `$.process.run` `stdout` and `stderr`, each. */
  outputBytes: 4 * MIB,
  /** `$.model.complete` `maxTokens` by default, and at most. */
  maxTokens: 1024,
  maxTokensCap: 64_000,
  /** `$.fs.read` and `$.fs.write`, one file. */
  fileBytes: 4 * MIB,
  /** A `$.http.fetch` request body, in characters; the response body, in bytes. */
  httpRequestChars: 4 * MIB,
  httpResponseBytes: 4 * MIB,
  /** One `$.http.fetch` call, redirects and body included. */
  httpMs: 30_000,
  redirects: 5,
  /** A `drop` reason or a `config.set` `deny` reason, in characters. */
  reasonChars: 4096,
  /** Text in one tree: the first characters drawn. */
  treeText: 100_000,
  /** A `Code`'s `language` or `path`, a `Select` option's `value`, a `Client`'s `module`. */
  fieldChars: 10_000,
  /** A `Link`'s `href`. */
  hrefChars: 2048,
  /** Nesting depth of one tree, below the root element. */
  treeDepth: 32,
  /** Elements and text children in one tree. */
  treeNodes: 20_000,
  /** `Raster` cells in one tree. */
  rasterCells: 262_144,
  /** PNG or RGBA bytes of all the `Image`s in one tree. */
  imageBytes: 2 * MIB,
  /** `$.store`: JSON in total. */
  storeBytes: 4 * MIB,
  /** `$.session.messages()`: the newest entries. */
  messages: 4096,
  toastMs: 4000,
  /** `$.ui.invalidate('ui.render')` redraws a second, and in the terminal for the visible pane, the expanded band and the hint line. */
  invalidatePerSecond: 10,
  invalidatePerSecondTerminal: 30,
  /** A pane opened without the user asking: placed from this many terminal columns, and from the second after they opened it once. */
  paneColumns: 144,
  paneColumnsAfterOpen: 110,
  /** Command, tool, subagent type and pane names. */
  nameChars: 64,
  /** Scopes nested inside one another in one file of a hooks module. */
  scopes: 2000,
  /** Nesting depth of a mods API call's arguments, of a changed event passed to `next`, and of a hook's return value. */
  nesting: 28_000,
  /** One `claude plugin test` test. */
  testMs: 5000,
} as const;

/** Command, tool, subagent type and pane names: letters, digits, `_` and `-`, up to `nameChars`. */
export const MOD_NAME_PATTERN: RegExp = new RegExp(`^[A-Za-z0-9_-]{1,${MOD_LIMITS.nameChars}}$`);
