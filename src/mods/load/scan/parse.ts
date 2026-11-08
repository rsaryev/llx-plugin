import { parse, type Node } from 'acorn';
import { error, type PluginIssue } from '../../../format/issues.ts';

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

export function parseModule(source: string, file: string): Parsed {
  try {
    return { program: parse(source, { ecmaVersion: 'latest', sourceType: 'module' }), issues: [] };
  } catch (thrown) {
    if (thrown instanceof RangeError || /stack/i.test(messageOf(thrown))) {
      return {
        issues: [
          error(
            file,
            `${file}: code nested too deep to scan (the parser stopped: ${messageOf(thrown)})`,
          ),
        ],
      };
    }
    return { issues: [error(file, `${file}: ${messageOf(thrown)}`)] };
  }
}
