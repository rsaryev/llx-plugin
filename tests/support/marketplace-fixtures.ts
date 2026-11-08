import type { PluginIssue } from '../../src/format/issues.ts';
import type { EntryReader } from '../../src/format/marketplace/marketplace.ts';

/**
 * `marketplace.json` shapes for the marketplace readers' tests. `docMarketplace` is the file of
 * create-marketplace.md ("Create the marketplace file"), copied field for field; `with` overrides
 * or, given `undefined`, removes a top-level key, so a test names only what it changes.
 */
export const docMarketplace = (): Record<string, unknown> => ({
  name: 'my-marketplace',
  description: 'Plugins for my team',
  owner: { name: 'Your Name' },
  plugins: [
    {
      name: 'my-first-plugin',
      source: './plugins/my-first-plugin',
      description: 'A greeting plugin to learn the basics',
    },
  ],
});

export function withFields(
  changes: Readonly<Record<string, unknown>>,
  base: Readonly<Record<string, unknown>> = docMarketplace(),
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base, ...changes };
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) delete merged[key];
  }
  return merged;
}

/** The errors in a list of issues. */
export const errorsOf = (issues: readonly PluginIssue[]): PluginIssue[] =>
  issues.filter((found) => found.severity === 'error');

/**
 * An entry reader that keeps an entry unless its `name` is the string `bad`, which it drops with
 * an error on `plugins[i]`, and records what it was given: enough to test the marketplace's
 * handling of its entries without the entry reader.
 */
export function recordingEntryReader(): {
  readonly read: EntryReader;
  readonly slots: { readonly index: number; readonly pluginRoot: string | undefined }[];
} {
  const slots: { readonly index: number; readonly pluginRoot: string | undefined }[] = [];
  const read: EntryReader = (raw, slot) => {
    slots.push({ index: slot.index, pluginRoot: slot.pluginRoot });
    const name =
      typeof raw === 'object' && raw !== null && 'name' in raw ? String(raw.name) : 'unnamed';
    if (name === 'bad') {
      return {
        entry: undefined,
        issues: [{ severity: 'error', path: `plugins[${slot.index}]`, message: 'invalid entry' }],
      };
    }
    return {
      entry: {
        name,
        source: { kind: 'relative', path: name, bare: false },
        strict: true,
        components: {},
        display: {},
      },
      issues: [],
    };
  };
  return { read, slots };
}
