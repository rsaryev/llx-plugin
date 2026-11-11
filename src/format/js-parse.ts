import { parse, type Node } from 'acorn';
import { error, type PluginIssue } from './issues.ts';

/**
 * Parses one file of a hooks module as an ES module (plugins/mods/create.md, "Check what Claude Code
 * reads from your mod": "Write every file as an ES module"). A file that cannot be parsed is an issue
 * with the file named, never a throw; code nested so deeply that the parser runs out of stack is the
 * documented `code nested too deep to scan (the parser stopped: <message>)` (troubleshoot.md).
 */
export interface Parsed {
  readonly program?: Node;
  readonly issues: readonly PluginIssue[];
}

const messageOf = (thrown: unknown): string =>
  thrown instanceof Error ? thrown.message : String(thrown);

/**
 * The message of a stack overflow without the position acorn appends, `(2:3405)`: the documented
 * reason "gives no line number and doesn't say what kind of code is nested" (troubleshoot.md).
 */
export const stackMessage = (thrown: unknown): string =>
  messageOf(thrown).replace(/\s*\(\d+:\d+\)$/, '');

/**
 * Whether `thrown` is a JavaScript engine running out of stack: a `RangeError`, or a message in the
 * words the engines use (V8, JavaScriptCore, SpiderMonkey). An ordinary error that only
 * mentions a stack, `stack is empty`, is not one (judgment: the docs name no test for it).
 */
export const isStackOverflow = (thrown: unknown): boolean =>
  thrown instanceof RangeError ||
  /maximum call stack size exceeded|too much recursion|stack overflow|not enough stack space/i.test(
    messageOf(thrown),
  );

export function parseModule(source: string, file: string): Parsed {
  try {
    return { program: parse(source, { ecmaVersion: 'latest', sourceType: 'module' }), issues: [] };
  } catch (thrown) {
    if (isStackOverflow(thrown)) {
      return {
        issues: [
          error(
            file,
            `${file}: code nested too deep to scan (the parser stopped: ${stackMessage(thrown)})`,
          ),
        ],
      };
    }
    return { issues: [error(file, `${file}: ${messageOf(thrown)}`)] };
  }
}
