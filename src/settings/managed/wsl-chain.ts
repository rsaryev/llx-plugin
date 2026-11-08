import { warning, type PluginIssue } from '../../format/issues.ts';
import type { AdminDocument } from './admin-source.ts';

/**
 * `wslInheritsWindowsSettings` (settings-reference.md, `wslInheritsWindowsSettings`; managed-settings.md,
 * "How Claude Code combines managed sources", "When an admin document counts as present"): which
 * documents a WSL session composes. The host reads the Windows `HKLM` value and the Windows
 * managed settings file (through `C:\Program Files\ClaudeCode`), `/etc/claude-code` and `HKCU`;
 * this decides which of them count.
 */
export interface WslDocuments {
  /** The `HKLM` registry value. */
  readonly hklm?: AdminDocument;
  /** The managed settings file and drop-ins under `C:\Program Files\ClaudeCode`. */
  readonly windowsFile?: AdminDocument;
  /** The managed settings file and drop-ins under `/etc/claude-code`. */
  readonly etcFile?: AdminDocument;
  /** The `HKCU` registry value. */
  readonly hkcu?: AdminDocument;
}

export interface WslChain {
  /** The documents that compose, with the sources `composeManaged` ranks them as. */
  readonly documents: readonly AdminDocument[];
  /** The Windows policy chain is on. */
  readonly chainOn: boolean;
  readonly issues: readonly PluginIssue[];
}

/** What a document says of the key: `on` is the chain, `set` whether it says anything, `invalid` an unreadable value. */
interface Flag {
  readonly set: boolean;
  readonly on: boolean;
  readonly invalid: boolean;
}

const UNSET: Flag = { set: false, on: false, invalid: false };

/** "Claude Code reads `true` and `false` with or without quotes and reads `null` as removing the key." */
const BOOLEAN_TEXT: ReadonlyMap<unknown, boolean> = new Map<unknown, boolean>([
  [true, true],
  [false, false],
  ['true', true],
  ['false', false],
]);

/** "Any other value counts as a present admin document with the chain turned on." */
const INVALID: Flag = { set: true, on: true, invalid: true };

function flagOf(document: AdminDocument | undefined): Flag {
  const value = document?.raw.wslInheritsWindowsSettings;
  if (value === undefined || value === null) return UNSET;
  const read = BOOLEAN_TEXT.get(value);
  return read === undefined ? INVALID : { set: true, on: read, invalid: false };
}

const isPresent = (document: AdminDocument | undefined): boolean =>
  document !== undefined && (document.present || flagOf(document).invalid);

/** The chain is on when the highest Windows admin document that sets the key turns it on. */
function chainFlag(windows: readonly (AdminDocument | undefined)[]): Flag {
  return windows.map(flagOf).find((flag) => flag.set) ?? UNSET;
}

/**
 * The documents a WSL session composes. "Claude Code honors it only when set in the HKLM registry
 * key or in a managed settings file or drop-in under `C:\Program Files\ClaudeCode\`". With the
 * chain on, the Windows documents stand above `/etc/claude-code`, which is read "only when no
 * Windows admin document is present", and `HKCU` joins "only when HKCU also sets the key to `true`".
 * With it off, WSL reads `/etc/claude-code` alone; an `HKLM` value or Windows-folder file that
 * exists but cannot be read keeps `/etc/claude-code` from applying either way.
 */
export function wslChain(documents: WslDocuments): WslChain {
  const windows = [documents.hklm, documents.windowsFile];
  const flag = chainFlag(windows);
  const windowsPresent = windows.some(isPresent);
  const windowsUnreadable = windows.some((document) => document?.unreadable !== undefined);
  const etc = windowsUnreadable || (flag.on && windowsPresent) ? undefined : documents.etcFile;
  const hkcuJoins = flag.on && flagOf(documents.hkcu).on;
  const composed = flag.on
    ? [documents.hklm, documents.windowsFile, etc, hkcuJoins ? documents.hkcu : undefined]
    : [etc];
  const issues = flag.invalid
    ? [
        warning(
          'managed:wslInheritsWindowsSettings',
          '"wslInheritsWindowsSettings" must be true or false; the Windows policy chain is treated as on',
        ),
      ]
    : [];
  return {
    documents: composed
      .filter((document): document is AdminDocument => document !== undefined)
      .map((document) => (isPresent(document) ? { ...document, present: true } : document)),
    chainOn: flag.on,
    issues,
  };
}
