import {
  readAdminDocument,
  type AdminDocument,
  type ManagedSource,
  type SourceRead,
} from './admin-source.ts';
import { composeManaged, type ComposeOptions, type ManagedComposition } from './compose.ts';
import { readFileDocument, type ManagedFileRead } from './drop-in.ts';

/**
 * What a host found at each managed source of the machine (managed-settings.md, "Choose a delivery
 * mechanism"): the kit reads no file, plist, registry value or fetch. A source the machine does not
 * have is left out. `labels` name a source in a report: a path, `per-user managed preferences`,
 * `Registry: HKLM\SOFTWARE\Policies\ClaudeCode\Settings`.
 */
export type ManagedReads = {
  readonly [S in Exclude<ManagedSource, 'file'>]?: SourceRead;
} & {
  /** `managed-settings.json` and the `managed-settings.d/` folder beside it. */
  readonly file?: ManagedFileRead;
  readonly labels?: Readonly<Partial<Record<ManagedSource, string>>>;
};

/** The documents of the sources the host found, in no particular order. */
function readManagedDocuments(reads: ManagedReads): AdminDocument[] {
  const label = (source: ManagedSource): string | undefined => reads.labels?.[source];
  const single = (source: Exclude<ManagedSource, 'file'>): AdminDocument[] => {
    const read = reads[source];
    return read === undefined ? [] : [readAdminDocument(source, read, label(source))];
  };
  const fileLabel = label('file');
  const file =
    reads.file === undefined
      ? []
      : [
          readFileDocument({
            ...(fileLabel === undefined ? {} : { label: { base: fileLabel } }),
            ...reads.file,
          }),
        ];
  return [...single('remote'), ...single('plist'), ...single('hklm'), ...file, ...single('hkcu')];
}

/** The managed tier of the sources the host found. */
export const composeManagedReads = (
  reads: ManagedReads,
  options: ComposeOptions = {},
): ManagedComposition => composeManaged(readManagedDocuments(reads), options);
