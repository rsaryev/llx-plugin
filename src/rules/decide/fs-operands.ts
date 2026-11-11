import type { ShellWord } from '../bash/words.ts';
import { sedOperands } from './sed-script.ts';

/**
 * The filesystem commands `acceptEdits` approves (permission-modes.md, "Auto-approve file edits with
 * acceptEdits mode": "`mkdir`, `touch`, `rm`, `rmdir`, `mv`, `cp`, and `sed`") and the operands each
 * writes, or `undefined` when the call does more than write them.
 */

const isOption = (word: ShellWord): boolean => word.value.startsWith('-') && word.value !== '-';

/** Every word that is not an option; after `--`, every word. */
function plainOperands(args: readonly ShellWord[]): readonly ShellWord[] {
  const end = args.findIndex((word) => word.value === '--');
  const before = end < 0 ? args : args.slice(0, end);
  const after = end < 0 ? [] : args.slice(end + 1);
  return [...before.filter((word) => !isOption(word)), ...after];
}

const TARGET_DIRECTORY = '--target-directory';
/** `-t DIR` or a cluster ending in it (`-vt DIR`), and one with the directory attached (`-vt/etc`). */
const SHORT_TARGET = /^-[A-Za-z]*t(.*)$/s;

/** A long option GNU reads as `--target-directory`: the name or a prefix of it, three letters on. */
const isTargetDirectory = (name: string): boolean =>
  name.length >= 3 && TARGET_DIRECTORY.startsWith(name);

/**
 * The directory written into a target option (`--target-directory=DIR`, `-vtDIR`), `''` for one
 * whose directory is the next word, `undefined` for another option.
 */
function attachedTarget(option: string): string | undefined {
  if (option.startsWith('--')) {
    const [name = '', ...value] = option.split('=');
    return isTargetDirectory(name) ? value.join('=') : undefined;
  }
  return SHORT_TARGET.exec(option)?.[1];
}

/** The directory one option of `mv` or `cp` names, and how many words it took. */
function targetOf(
  args: readonly ShellWord[],
  at: number,
): { readonly target: ShellWord | undefined; readonly taken: number } {
  const word = args[at];
  const attached = word === undefined ? undefined : attachedTarget(word.value);
  if (word === undefined || attached === undefined) return { target: undefined, taken: 1 };
  return attached === ''
    ? { target: args[at + 1], taken: 2 }
    : { target: { ...word, value: attached }, taken: 1 };
}

/** `mv` and `cp`: the operands and the target directory an option names (`-t`, `--target-directory`). */
function moveOperands(args: readonly ShellWord[]): readonly ShellWord[] {
  const operands: ShellWord[] = [];
  let at = 0;
  while (at < args.length) {
    const word = args[at];
    if (word === undefined || word.value === '--') {
      operands.push(...args.slice(at + 1));
      break;
    }
    if (!isOption(word)) {
      operands.push(word);
      at += 1;
      continue;
    }
    const { target, taken } = targetOf(args, at);
    if (target !== undefined) operands.push(target);
    at += taken;
  }
  return operands;
}

/** `touch` takes no option here: `-r` and `-d` read another file or a date the kit does not judge. */
const touchOperands = (args: readonly ShellWord[]): readonly ShellWord[] | undefined =>
  args.some(isOption) ? undefined : args;

const OPERANDS: ReadonlyMap<
  string,
  (args: readonly ShellWord[]) => readonly ShellWord[] | undefined
> = new Map([
  ['mkdir', plainOperands],
  ['touch', touchOperands],
  ['rm', plainOperands],
  ['rmdir', plainOperands],
  ['mv', moveOperands],
  ['cp', moveOperands],
  ['sed', sedOperands],
]);

export const isFilesystemProgram = (program: string): boolean => OPERANDS.has(program);

/** The operands a filesystem command writes (its words after the program), or `undefined`. */
export const filesystemOperands = (
  program: string,
  args: readonly ShellWord[],
): readonly ShellWord[] | undefined => OPERANDS.get(program)?.(args);
