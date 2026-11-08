import { error, type PluginIssue } from '../../format/issues.ts';
import { isStackOverflow, stackMessage } from './scan/parse.ts';

/**
 * What the kit says when a host's engine or compiler fails while it loads a hooks module
 * (plugins/mods/troubleshoot.md, "`hooks module did not load`" and the entries after it). The kit
 * never evaluates a module, so the host's runtime is where the engine runs out of stack; these are
 * the reasons it reports, in the documented words, as `PluginIssue` values the loader turns into the
 * line `<mod>: hooks module did not load: <file>: <reason>`.
 */

/** Where the engine ran out of stack: following the file's imports, or running the file. */
export type StackPhase = 'link' | 'load';

const STACK_REASONS: {
  readonly [P in StackPhase]: (message: string) => string;
} = {
  link: () => 'the engine ran out of stack linking the file and its imports',
  load: (message) =>
    `the engine ran out of stack loading the file (code nested too deep): ${message}`,
};

/** The issue for an engine that ran out of stack at `phase` on `file`; `message` is the engine's own text (used by `load`). */
export const engineStackIssue = (phase: StackPhase, file: string, message: string): PluginIssue =>
  error(file, `${file}: ${STACK_REASONS[phase](message)}`);

const messageOf = (thrown: unknown): string =>
  thrown instanceof Error ? thrown.message : String(thrown);

/**
 * The issue for something a host's engine threw while loading `file` (a runtime that throws instead
 * of returning issues): a stack overflow is the documented `loading the file` reason, anything else
 * is the thrown message under the file's name (judgment: the docs name only the stack reasons).
 */
export function thrownByEngine(file: string, thrown: unknown): PluginIssue {
  return isStackOverflow(thrown)
    ? engineStackIssue('load', file, stackMessage(thrown))
    : error(file, `${file}: ${messageOf(thrown)}`);
}

/** The issue for a compiler that threw instead of returning issues. */
export const thrownByCompiler = (file: string, thrown: unknown): PluginIssue =>
  error(file, `${file}: the compiler failed: ${messageOf(thrown)}`);
