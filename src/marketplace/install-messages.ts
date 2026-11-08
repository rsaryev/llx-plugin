import { classifyStoreEntry, type StoreEntry, type StoreLayout } from './store-layout.ts';

/**
 * The exact texts of the install and loading problems the docs quote (plugins/troubleshooting.md,
 * plugins/loading.md, plugins/cli-reference.md): pure builders, each named for the heading it
 * answers. A text the docs quote is asserted verbatim in tests/marketplace/install-messages.test.ts;
 * the join between a quoted message and a quoted hint or fix, which the docs do not show, is a row
 * in spec/judgments.md. Messages the Errors tab of `/plugin` shows come as `ErrorsTabEntry`: the
 * message and the guidance line beneath it.
 */

/** An entry of the `/plugin` **Errors** tab: "Each entry pairs a message with a guidance line." */
export interface ErrorsTabEntry {
  readonly message: string;
  readonly guidance: string;
}

const quoted = (names: readonly string[]): string => names.map((name) => `"${name}"`).join(', ');

// ---- installed_plugins.json ----

const OPTIONS =
  'Update Claude Code with "claude update". If you cannot update, uninstall the plugin with the version of Claude Code that wrote the record. If neither helps, delete the record from installed_plugins.json by hand, then restart Claude Code or run /reload-plugins.';

/**
 * "installed_plugins.json holds a record under "<id>" that this version of Claude Code cannot
 * read"; with several, "holds records under" (troubleshooting.md). The options after it are the
 * three steps of that section, in order.
 */
export function unreadableRecordsMessage(ids: readonly string[]): string {
  const subject = ids.length === 1 ? 'a record' : 'records';
  return `installed_plugins.json holds ${subject} under ${quoted(ids)} that this version of Claude Code cannot read. ${OPTIONS}`;
}

/** "The whole file declares a format this version doesn't know" (troubleshooting.md). */
export const unknownFormatMessage = (version: number): string =>
  `installed_plugins.json is in a format (version ${version}) that this version of Claude Code does not know`;

// ---- the commands that refuse, and the notes `claude plugin list` prints ----

/** The three commands that refuse while a record cannot be read, with the word their refusal uses. */
export type RefusingCommand = 'install' | 'uninstall' | 'update';

const REFUSED: { readonly [C in RefusingCommand]: string } = {
  install: 'installed',
  uninstall: 'uninstalled',
  update: 'updated',
};

/** `failureCode` of `--json` on those three commands when a record cannot be read. */
export const RECORDS_UNREADABLE_CODE = 'install_records_unreadable';

export interface RecordsRefusal {
  /** `Plugin "<name>" was not installed:` (or `uninstalled`, `updated`) and the same text `claude plugin list` prints. */
  readonly message: string;
  /** The result line of `--json` carries this message and this `failureCode`. */
  readonly failureCode: typeof RECORDS_UNREADABLE_CODE;
}

/**
 * How `claude plugin install`, `uninstall` and `update` refuse (troubleshooting.md): `Plugin
 * "<name>" was not installed:`, `was not uninstalled:` or `was not updated:`, followed by the
 * unreadable-record text; with `--json` the result carries that `message` and `failureCode`.
 */
export const refuseForUnreadableRecords = (
  command: RefusingCommand,
  name: string,
  reason: string,
): RecordsRefusal => ({
  message: `Plugin "${name}" was not ${REFUSED[command]}: ${reason}`,
  failureCode: RECORDS_UNREADABLE_CODE,
});

/** `claude plugin list` prints the unreadable-record text as a `Note:`. */
export const listNote = (text: string): string => `Note: ${text}`;

/**
 * The note naming a dated copy that sits beside `installed_plugins.json`. Judgment
 * (spec/judgments.md): the words around the quoted heading and the path.
 */
export const rebuiltNote = (keptPath: string): string =>
  listNote(
    `installed_plugins.json could not be read and was rebuilt. The old contents are kept in ${keptPath}.`,
  );

/** "The note ends `Nothing needs doing about these copies.`" (troubleshooting.md). */
export const setAsideNote = (copyPath: string): string =>
  listNote(
    `install records under names that no version of Claude Code can use were removed from installed_plugins.json. A copy of them is kept in ${copyPath}. Nothing needs doing about these copies.`,
  );

/**
 * The notes `claude plugin list` prints "for as long as" a dated copy "sits beside
 * `installed_plugins.json`" (troubleshooting.md): one per `.unreadable` copy and one per
 * `.set-aside` copy found among `names`, the files directly under the plugins root.
 */
export function recoveryNotes(names: readonly string[], layout: StoreLayout): readonly string[] {
  return names.flatMap((name) => {
    const note = COPY_NOTES[classifyStoreEntry(name)];
    return note === undefined ? [] : [note(layout.file(name))];
  });
}

const COPY_NOTES: { readonly [E in StoreEntry]?: (path: string) => string } = {
  'unreadable-copy': rebuiltNote,
  'set-aside-copy': setAsideNote,
};
