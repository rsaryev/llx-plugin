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
  actionButtons,
  digitButton,
  hotkeyTable,
  treeProblem,
} from '../../../src/mods/ui/index.ts';

import { node, text } from '../../support/mods-ui.ts';
import { spec } from '../../support/spec.ts';
import { buttonKey } from '../../../src/mods/ui/elements/button.ts';
import { drawnProps } from '../../../src/mods/ui/elements/surface.ts';

const problemOf = (tree: unknown, surface: 'terminal' | 'desktop' | 'vscode' = 'terminal') =>
  treeProblem('Pane', surface, tree);

spec('mods.element.Button', () => {
  test('a Button takes the props of the table', () => {
    const props = {
      key: 'b',
      label: 'Add',
      onPress: () => undefined,
      hotkey: 'a',
      plain: true,
      dimColor: true,
      autoFocus: true,
      action: 'chat:submit',
      variant: 'primary',
      role: 'dismiss',
      hover: {},
    };
    expect(problemOf(node('Button', props))).toBeUndefined();
  });

  test('variant is primary or secondary and any other value throws', () => {
    expect(node('Button', { key: 'a', variant: 'primary' }).props.variant).toBe('primary');
    expect(node('Button', { key: 'a', variant: 'secondary' }).props.variant).toBe('secondary');
    expect(() => node('Button', { key: 'a', variant: 'danger' })).toThrow();
  });

  test('role is dismiss and any other value throws', () => {
    expect(node('Button', { key: 'a', role: 'dismiss' }).props.role).toBe('dismiss');
    expect(() => node('Button', { key: 'a', role: 'close' })).toThrow();
  });

  test('a Button holds strings and Text, and any other element inside it is refused', () => {
    const chip = node('Button', { key: 'row', children: ['Name ', text('detail')] });
    expect(problemOf(chip)).toBeUndefined();
    const refused = node('Button', { key: 'row', children: [node('Box')] });
    expect(problemOf(refused)).toContain('Button cannot hold');
  });

  test('the key is the key, else the label, else a single string child; none is "<Button> needs a key"', () => {
    expect(buttonKey(node('Button', { key: 'k', label: 'L' }))).toBe('k');
    expect(buttonKey(node('Button', { label: 'More' }))).toBe('More');
    expect(buttonKey(node('Button', { children: ['Add one'] }))).toBe('Add one');
    expect(buttonKey(node('Button', { children: ['a', text('b')] }))).toBeUndefined();
    expect(problemOf(node('Button', { children: ['a', text('b')] }))).toBe(
      'a tree Pane refuses: <Button> needs a key',
    );
    expect(problemOf(node('Button', { label: 'More' }))).toBeUndefined();
  });

  test('autoFocus accepts only true, on a Button, an Input and a Select', () => {
    expect(problemOf(node('Button', { key: 'b', autoFocus: true }))).toBeUndefined();
    expect(problemOf(node('Button', { key: 'b', autoFocus: false }))).toContain('autoFocus');
    expect(problemOf(node('Input', { key: 'i', autoFocus: false }))).toContain('autoFocus');
    expect(problemOf(node('Input', { key: 'i', autoFocus: true }))).toBeUndefined();
    const options = [{ value: 'a' }];
    expect(problemOf(node('Select', { key: 's', options, autoFocus: false }))).toContain(
      'autoFocus',
    );
    expect(problemOf(node('Select', { key: 's', options, autoFocus: true }))).toBeUndefined();
  });

  test('a hotkey is one digit or one lowercase letter', () => {
    for (const hotkey of ['1', '0', 'a', 'z']) {
      expect(problemOf(node('Button', { key: 'b', hotkey }))).toBeUndefined();
    }
    for (const hotkey of ['A', 'ab', '', '!']) {
      expect(problemOf(node('Button', { key: 'b', hotkey }))).toContain('hotkey');
    }
  });

  test('the VS Code extension ignores hotkey, plain, autoFocus, action, hover, variant and role, and presses by click', () => {
    const button = node('Button', {
      key: 'b',
      label: 'Go',
      hotkey: 'a',
      plain: true,
      autoFocus: true,
      action: 'x',
      hover: {},
      variant: 'primary',
      role: 'dismiss',
    });
    expect(drawnProps('vscode', button)).toEqual({ key: 'b', label: 'Go' });
    const tree = node('Box', { children: [button] });
    const here = {
      surface: 'vscode',
      isBand: false,
      isCollapsed: false,
      hasFocus: true,
      isInputFocused: false,
    } as const;
    expect(hotkeyTable(tree, here).size).toBe(0);
  });

  test('when two buttons in one drawing name the same hotkey the later one gets it', () => {
    const first = node('Button', { key: 'first', hotkey: 'a' });
    const later = node('Button', { key: 'later', hotkey: 'a' });
    const other = node('Button', { key: 'other', hotkey: 'b' });
    const tree = node('Box', { children: [first, later, other] });
    const table = hotkeyTable(tree, {
      surface: 'terminal',
      isBand: false,
      isCollapsed: false,
      hasFocus: true,
      isInputFocused: false,
    });
    expect(table.get('a')).toBe(later);
    expect(table.get('b')).toBe(other);
  });

  test('a digit hotkey on a band button also fires when the digit is typed alone into an empty prompt', () => {
    const button = node('Button', { key: 'one', hotkey: '1' });
    const letter = node('Button', { key: 'a', hotkey: 'a' });
    const tree = node('Box', { children: [button, letter] });
    const band = {
      surface: 'terminal',
      isBand: true,
      isCollapsed: false,
      hasFocus: true,
      isInputFocused: false,
    } as const;
    expect(digitButton(tree, band, '1', true)).toBe(button);
    expect(digitButton(tree, band, '1', false)).toBeUndefined();
    expect(digitButton(tree, band, 'a', true)).toBeUndefined();
    expect(digitButton(tree, { ...band, isBand: false }, '1', true)).toBeUndefined();
  });

  test('while the band is collapsed neither an action binding nor a hotkey presses a button in it', () => {
    const button = node('Button', { key: 'one', hotkey: '1', action: 'chat:cancel' });
    const tree = node('Box', { children: [button] });
    const open = {
      surface: 'terminal',
      isBand: true,
      isCollapsed: false,
      hasFocus: true,
      isInputFocused: false,
    } as const;
    const collapsed = { ...open, isCollapsed: true };
    expect(hotkeyTable(tree, open).get('1')).toBe(button);
    expect(hotkeyTable(tree, collapsed).size).toBe(0);
    expect(digitButton(tree, collapsed, '1', true)).toBeUndefined();
    expect(actionButtons(tree, open, 'chat:cancel', 'ctrl+x ctrl+k')).toEqual([button]);
    expect(actionButtons(tree, collapsed, 'chat:cancel', 'ctrl+x ctrl+k')).toEqual([]);
  });

  test('a hotkey presses its button only while the pane or band has keyboard focus, and not while an Input has it; a digit hotkey on the band and an action binding need no focus', () => {
    const button = node('Button', { key: 'one', hotkey: '1', action: 'chat:cancel' });
    const tree = node('Box', { children: [button] });
    const band = {
      surface: 'terminal',
      isBand: true,
      isCollapsed: false,
      hasFocus: true,
      isInputFocused: false,
    } as const;
    expect(hotkeyTable(tree, band).get('1')).toBe(button);
    const keysGoToPrompt = { ...band, hasFocus: false };
    expect(hotkeyTable(tree, keysGoToPrompt).size).toBe(0);
    expect(digitButton(tree, keysGoToPrompt, '1', true)).toBe(button);
    expect(actionButtons(tree, keysGoToPrompt, 'chat:cancel', 'ctrl+k')).toEqual([button]);
    const typing = { ...band, isInputFocused: true };
    expect(hotkeyTable(tree, typing).size).toBe(0);
  });

  test('an action presses the button when the user binding is a chord or a modified key, not a plain key', () => {
    const button = node('Button', { key: 'b', action: 'chat:cancel' });
    const tree = node('Box', { children: [button] });
    const here = {
      surface: 'terminal',
      isBand: false,
      isCollapsed: false,
      hasFocus: true,
      isInputFocused: false,
    } as const;
    expect(actionButtons(tree, here, 'chat:cancel', 'ctrl+k')).toEqual([button]);
    expect(actionButtons(tree, here, 'chat:cancel', 'ctrl+x ctrl+k')).toEqual([button]);
    expect(actionButtons(tree, here, 'chat:cancel', 'k')).toEqual([]);
    expect(actionButtons(tree, here, 'other', 'ctrl+k')).toEqual([]);
  });
});

spec(
  [
    'mods.element.Input',
    'mods.troubleshoot.needs a key, is drawn twice, or key each once',
    'mods.interface.Which controls need a key',
  ],
  () => {
    test('an Input takes key, label, placeholder, value, submitLabel, rows, onSubmit, onInput and autoFocus', () => {
      const props = {
        key: 'new-note',
        label: 'Note',
        placeholder: 'Type',
        value: '',
        submitLabel: 'add',
        rows: 2,
        onSubmit: () => undefined,
        onInput: () => undefined,
        autoFocus: true,
      };
      expect(problemOf(node('Input', props))).toBeUndefined();
    });

    test('an Input needs a non-empty string key: none, empty or 3 gives "<Input> needs a key"', () => {
      for (const given of [{}, { key: '' }, { key: 3 }]) {
        expect(problemOf(node('Input', given))).toBe('a tree Pane refuses: <Input> needs a key');
      }
    });

    test('two Inputs with one key give "Input "size" is drawn twice; each takes its own key"', () => {
      const tree = node('Box', {
        children: [node('Input', { key: 'size' }), node('Input', { key: 'size' })],
      });
      expect(problemOf(tree)).toBe(
        'a tree Pane refuses: Input "size" is drawn twice; each takes its own key',
      );
    });

    test('the VS Code extension ignores autoFocus and rows on an Input', () => {
      const input = node('Input', { key: 'i', label: 'L', rows: 3, autoFocus: true });
      expect(drawnProps('vscode', input)).toEqual({ key: 'i', label: 'L' });
    });
  },
);

spec('mods.element.Select', () => {
  test('a Select takes key, label, options, value, onSelect and autoFocus, with options of at least one choice and unique values', () => {
    const options = [
      { value: 'sm', label: 'Small' },
      { value: 'lg', label: 'Large' },
    ];
    const props = {
      key: 'size',
      label: 'Size',
      options,
      value: 'sm',
      onSelect: () => undefined,
      autoFocus: true,
    };
    expect(problemOf(node('Select', props))).toBeUndefined();
    expect(problemOf(node('Select', { key: 'size', options: [] }))).toContain(
      'at least one option',
    );
    expect(problemOf(node('Select', { key: 'size' }))).toContain('at least one option');
    expect(
      problemOf(node('Select', { key: 'size', options: [{ value: 'a' }, { value: 'a' }] })),
    ).toContain('unique values');
  });

  test('a Select needs a key, and two with one key are drawn twice', () => {
    const options = [{ value: 'a' }];
    expect(problemOf(node('Select', { options }))).toBe(
      'a tree Pane refuses: <Select> needs a key',
    );
    const tree = node('Box', {
      children: [node('Select', { key: 's', options }), node('Select', { key: 's', options })],
    });
    expect(problemOf(tree)).toBe(
      'a tree Pane refuses: Select "s" is drawn twice; each takes its own key',
    );
  });

  test('the VS Code extension ignores autoFocus on a Select', () => {
    const select = node('Select', { key: 's', options: [{ value: 'a' }], autoFocus: true });
    expect(drawnProps('vscode', select)).toEqual({ key: 's', options: [{ value: 'a' }] });
  });
});
