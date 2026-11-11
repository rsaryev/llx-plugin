import { agentsEntryNotFile, skillsEntryNotDirectory } from '../format/messages.ts';
import type { FileStat } from '../ports/index.ts';
import type { ListedKind } from './walk.ts';

/**
 * What a manifest path of each kind must be (plugins/manifest-reference.md, "Path-only fields":
 * "`agents` entries must be `.md` files, and `skills` entries must be directories. The other three
 * accept a directory or a file"; `commands` takes a flat file or a directory). The message of the
 * mismatch, or `undefined` when the path is the right shape. The wording is the kit's (judgment).
 */
type Shape = (stat: FileStat, written: string) => string | undefined;

const either: Shape = () => undefined;

export const DECLARED_SHAPE: { readonly [K in ListedKind]: Shape } = {
  skills: (stat, written) => (stat.isDirectory ? undefined : skillsEntryNotDirectory(written)),
  agents: (stat, written) => (stat.isDirectory ? agentsEntryNotFile(written) : undefined),
  commands: either,
  outputStyles: either,
  workflows: either,
  themes: either,
};
