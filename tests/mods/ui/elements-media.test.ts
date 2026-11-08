/**
 * The elements of a tree.
 * plugins/mods/reference.md § Elements (the elements table with the apps that draw each, "More
 * `Button` rules", the props the VS Code extension ignores, "`Box` border styles", "`Box` spacing
 * steps", "`Text` typography props", "Replace `bold` with `weight`"); plugins/mods/interface.md §
 * Build a tree from elements ("a prop an element doesn't take or a child where none goes"), §
 * Respond to presses and typing ("Which controls need a `key`", "Set a hotkey and the first focus"),
 * § `Link` in the Desktop app and VS Code; plugins/mods/troubleshoot.md § A pane or band is empty,
 * § `needs a key`, `is drawn twice`. The kit validates and routes a tree; it draws nothing, so no
 * test here claims a pixel or a terminal cell.
 */
import { expect, test } from 'bun:test';

import {
  clientFailure,
  clientFailureLine,
  drawnProps,
  drawsAsLink,
  treeProblem,
} from '../../../src/mods/ui/index.ts';

import { node } from '../../support/mods-ui.ts';
import { spec } from '../../support/spec.ts';

const problemOf = (tree: unknown, surface: 'terminal' | 'desktop' | 'vscode' = 'terminal') =>
  treeProblem('Pane', surface, tree);

spec(
  [
    'mods.element.Link',
    'mods.interface.Link in the Desktop app and VS Code.No @',
    'mods.interface.Link in the Desktop app and VS Code.Scheme and host',
    'mods.interface.Link in the Desktop app and VS Code.Spelling',
  ],
  () => {
    test('a Link takes href and label, and needs an href', () => {
      expect(
        problemOf(node('Link', { href: 'https://example.com', label: 'Docs' })),
      ).toBeUndefined();
      expect(problemOf(node('Link', { label: 'Docs' }))).toBe(
        'a tree Pane refuses: Link needs an href',
      );
    });

    test('in the terminal every href draws as a link', () => {
      expect(drawsAsLink('terminal', 'ftp://x y@z')).toBe(true);
    });

    test('in the Desktop app and VS Code an https URL or http://localhost one that is spelled as new URL(href).href draws as a link', () => {
      for (const surface of ['desktop', 'vscode'] as const) {
        expect(drawsAsLink(surface, 'https://example.com/path?q=1')).toBe(true);
        expect(drawsAsLink(surface, 'http://localhost:3000/a')).toBe(true);
        // a missing `/` after the host is allowed
        expect(drawsAsLink(surface, 'https://example.com')).toBe(true);
        expect(drawsAsLink(surface, 'http://localhost:3000')).toBe(true);
        expect(drawsAsLink(surface, 'https://example.com?q=1')).toBe(true);
        expect(drawsAsLink(surface, 'https://example.com#a')).toBe(true);
        expect(drawsAsLink(surface, 'http://localhost:3000?q=1#a')).toBe(true);
        expect(drawsAsLink(surface, 'https://example.com/a%40b')).toBe(true);
      }
    });

    test('otherwise it draws as plain text: other schemes or hosts, an @, an uppercase host, a space, :443', () => {
      for (const surface of ['desktop', 'vscode'] as const) {
        for (const href of [
          'http://example.com',
          'ftp://example.com',
          'http://127.0.0.1:3000',
          'https://user@example.com/',
          'https://example.com/a@b',
          'https://Example.com/',
          'https://example.com/a b',
          'https://example.com:443/',
          'https://example.com:443?q=1',
          'https://Example.com?q=1',
          'https://example.com?q=a b',
          'not a url',
        ]) {
          expect(drawsAsLink(surface, href)).toBe(false);
        }
      }
    });
  },
);

spec('mods.element.Code', () => {
  test('a Code takes source, language, path, startLine, format and wrap', () => {
    const props = {
      source: 'x',
      language: 'ts',
      path: 'a.ts',
      startLine: 3,
      format: 'diff',
      wrap: true,
    };
    expect(problemOf(node('Code', props))).toBeUndefined();
  });

  test('the VS Code extension ignores language, path, startLine, format and wrap, so a diff shows its raw text', () => {
    const code = node('Code', {
      source: '+a',
      language: 'ts',
      path: 'a.ts',
      startLine: 3,
      format: 'diff',
      wrap: true,
    });
    expect(drawnProps('vscode', code)).toEqual({ source: '+a' });
  });
});

spec('mods.element.Markdown', () => {
  test('a Markdown takes its content in text, not in children, and key, dimColor, onLinkPress, pressableLinks', () => {
    const props = {
      text: '# hi',
      key: 'm',
      dimColor: true,
      onLinkPress: () => undefined,
      pressableLinks: true,
    };
    expect(problemOf(node('Markdown', props))).toBeUndefined();
    expect(problemOf(node('Markdown', { text: 'x', children: ['no'] }))).toContain(
      'takes no children',
    );
  });

  test('a Markdown needs a key when you pass onLinkPress', () => {
    expect(problemOf(node('Markdown', { text: 'x', onLinkPress: () => undefined }))).toBe(
      'a tree Pane refuses: Markdown prop "onLinkPress" needs a key',
    );
    expect(problemOf(node('Markdown', { text: 'x' }))).toBeUndefined();
  });
});

spec('mods.element.Svg', () => {
  test('an Svg is drawn by the Desktop app and VS Code, not the terminal, and takes source, alt, width, height and isInteractive', () => {
    const svg = node('Svg', {
      source: '<svg/>',
      alt: 'a',
      width: 10,
      height: 10,
      isInteractive: true,
    });
    expect(problemOf(svg, 'desktop')).toBeUndefined();
    expect(problemOf(svg, 'vscode')).toBeUndefined();
    expect(problemOf(svg, 'terminal')).toBe(
      'a tree Pane refuses: Svg is not drawn by the terminal app',
    );
  });

  test('a source of SVG markup goes up to 131,072 characters', () => {
    expect(problemOf(node('Svg', { source: 'x'.repeat(131_072) }), 'desktop')).toBeUndefined();
    expect(problemOf(node('Svg', { source: 'x'.repeat(131_073) }), 'desktop')).toContain(
      'Svg prop "source" is longer than 131072 characters',
    );
  });

  test('the VS Code extension ignores isInteractive', () => {
    const svg = node('Svg', { source: '<svg/>', isInteractive: true });
    expect(drawnProps('vscode', svg)).toEqual({ source: '<svg/>' });
  });
});

spec(['mods.element.Client', 'mods.interface.When a Client fails'], () => {
  test('a Client is drawn by the terminal and the Desktop app, not VS Code, and takes module, key, props, width, height and flexGrow', () => {
    const client = node('Client', {
      module: 'client/x.js',
      key: 'c',
      props: {},
      width: 1,
      height: 1,
      flexGrow: 1,
    });
    expect(problemOf(client, 'terminal')).toBeUndefined();
    expect(problemOf(client, 'desktop')).toBeUndefined();
    expect(problemOf(client, 'vscode')).toBe(
      'a tree Pane refuses: Client is not drawn by the vscode app',
    );
  });

  test('a Client that fails is replaced in the terminal by a dimmed line of the mod, the Client, its file and the reason', () => {
    expect(clientFailureLine('my-mod', 'client/spinner.js', 'boom')).toBe(
      'my-mod: Client client/spinner.js: boom',
    );
    const line = clientFailure('my-mod', 'client/spinner.js', 'boom');
    expect(line).toEqual({
      type: 'Text',
      props: { dimColor: true },
      children: ['my-mod: Client client/spinner.js: boom'],
    });
    // the rest of the drawing still shows: the line is one valid element among its siblings
    const drawing = node('Box', { children: [node('Text', { children: ['kept'] }), line] });
    expect(problemOf(drawing)).toBeUndefined();
  });
});

spec(['mods.element.Raster', 'mods.interface.Draw a grid of colored cells'], () => {
  test('a Raster is drawn by the terminal only and takes key, columns up to 512, rows up to 256 and cells', () => {
    const raster = (columns: number, rows: number) =>
      node('Raster', { key: 'grid', columns, rows, cells: 'AAAA' });
    expect(problemOf(raster(512, 256), 'terminal')).toBeUndefined();
    expect(problemOf(raster(513, 1), 'terminal')).toBe(
      'a tree Pane refuses: Raster prop "columns" must be a whole number from 1 to 512',
    );
    expect(problemOf(raster(1, 257), 'terminal')).toBe(
      'a tree Pane refuses: Raster prop "rows" must be a whole number from 1 to 256',
    );
    expect(problemOf(raster(3, 2), 'desktop')).toBe(
      'a tree Pane refuses: Raster is not drawn by the desktop app',
    );
    expect(problemOf(raster(3, 2), 'vscode')).toContain('Raster is not drawn');
  });
});

spec('mods.element.Image', () => {
  test('an Image is drawn by the terminal only and takes key, source, columns and rows up to 255, and alt', () => {
    const image = (columns: number, rows: number) =>
      node('Image', { key: 'i', source: new Uint8Array(4), columns, rows, alt: 'x' });
    expect(problemOf(image(255, 255), 'terminal')).toBeUndefined();
    expect(problemOf(image(256, 1), 'terminal')).toContain('Image prop "columns"');
    expect(problemOf(image(1, 256), 'terminal')).toContain('Image prop "rows"');
    expect(problemOf(image(1, 1), 'desktop')).toBe(
      'a tree Pane refuses: Image is not drawn by the desktop app',
    );
  });

  test('a source can be a file path', () => {
    expect(
      problemOf(node('Image', { key: 'i', source: '/tmp/a.png' }), 'terminal'),
    ).toBeUndefined();
  });
});
