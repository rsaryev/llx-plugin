/**
 * oracle 2.1.322 (spec/judgments.md, `src/mods/load/scan/client-modules.ts`): what
 * `claude plugin validate`, run as a black box, reads of a `Client`'s `module`. The docs give the
 * prop (plugins/mods/reference.md, "Elements": `Client` takes `module`, `key`, `props`…) and say
 * the file is "a second file of yours" (interface.md, "Build a tree from elements"), not how it is
 * found. Each input below is a minimal module of the kit's own, as the oracle was run on.
 */
import { describe, expect, test } from 'bun:test';
import { validateMod } from '../../../src/mods/load/commands/validate.ts';
import { scanHooksModule } from '../../../src/mods/load/scan/index.ts';
import { memoryFiles } from '../../support/ports.ts';

const moduleWith = (value: string): string => `import { Client, Box } from 'claude-code'
const chosen = './x.js'
export function register(on) {
  on('ui.render', { site: 'Pane' }, async ($, e) => Box({}, Client({ key: 'a', module: ${value} })))
}`;

const scan = (value: string) =>
  scanHooksModule(moduleWith(value), './register.js', { isEntry: true, directory: 'hooks' });
const messages = (value: string): string[] => scan(value).issues.map((issue) => issue.message);

describe('the module of a Client', () => {
  test('a relative literal, or a template with no substitution, is a surface module from the plugin root', () => {
    expect(scan("'../client/spinner.js'").surfaceModules).toEqual(['client/spinner.js']);
    expect(scan('`./board.js`').surfaceModules).toEqual(['hooks/board.js']);
    expect(messages("'../client/spinner.js'")).toEqual([]);
  });

  test('each Client module has its span in the text scanned: the literal, quotes included (judgment)', () => {
    const source = moduleWith("'../client/spinner.js'");
    const spans = scanHooksModule(source, './register.js', {
      isEntry: true,
      directory: 'hooks',
    }).surfaceModuleSpans;
    expect(spans).toHaveLength(1);
    const [span] = spans;
    expect(span?.module).toBe('client/spinner.js');
    expect(source.slice(span?.start, span?.end)).toBe("'../client/spinner.js'");
  });

  test('a variable or a concatenation is refused: the module must be a string literal', () => {
    const literal =
      "./register.js: Client module must be a string literal, the surface module's path relative to this file";
    expect(messages('chosen')).toEqual([`${literal} (got the variable chosen)`]);
    expect(messages("'../client/' + 'spinner.js'")).toEqual([`${literal} (got a concatenation)`]);
  });

  test('a path that is not relative, or that leaves the plugin folder, is refused', () => {
    expect(messages("'client/spinner.js'")).toEqual([
      './register.js: Client module "client/spinner.js" is not relative: spell the surface module\'s path from this file ("./board.tsx")',
    ]);
    expect(messages("'../../outside.js'")).toEqual([
      './register.js: Client module "../../outside.js" leaves the plugin\'s folder',
    ]);
  });

  test('validate lists the surface modules, and a module that is not there is an error', async () => {
    const run = async (value: string) => {
      const files = memoryFiles({
        '.claude-plugin/plugin.json': JSON.stringify({ name: 'probe', version: '0.1.0' }),
        'hooks/hooks.json': JSON.stringify({ modules: ['./register.js'] }),
        'hooks/register.js': moduleWith(value),
        'client/spinner.js': 'export default function draw() {}',
      });
      return (await validateMod({ files, target: '.' })).lines.join('\n');
    };
    expect(await run("'../client/spinner.js'")).toContain(
      './register.js surface modules: client/spinner.js',
    );
    expect(await run("'./x.js'")).toContain('hooks/x.js: no such file');
  });
});
