/**
 * interface.md § Keyboard focus and hotkeys ("How a pane gets keyboard focus", "What each key does",
 * "Set a hotkey and the first focus"), § When the user collapses the band, § Which controls need a
 * `key`; troubleshoot.md § The band shows `plugin panel hidden`, § Hotkeys do nothing. The kit decides
 * which control a key is for; reading the keyboard is the host's, so a key here is a name, not an event.
 */
import { describe, expect, test } from 'bun:test';
import {
  clickFocuses,
  collapsedRow,
  createBandState,
  grantsFocus,
  handleKey,
  initialFocus,
  maxPaneColumns,
  paneColumns,
  resizedColumns,
  type KeyContext,
  type KeyState,
} from '../../../src/mods/ui/index.ts';
import { node } from '../../support/mods-ui.ts';
import { spec } from '../../support/spec.ts';

const I = 'mods.interface.';
const tree = () =>
  node('Box', {
    children: [
      node('Button', { key: 'one', label: 'One', hotkey: '1', plain: true }),
      node('Input', { key: 'note', label: 'Note' }),
      node('Select', { key: 'size', options: [{ value: 'a', label: 'A' }] }),
      node('Button', { key: 'more', label: 'Add', hotkey: 'a' }),
    ],
  });

const fresh: KeyState = { focused: undefined, chord: false };
const context = (over: Partial<KeyContext> = {}): KeyContext => ({
  tree: tree(),
  surface: 'terminal',
  isBand: false,
  isCollapsed: false,
  hasFocus: true,
  closeOnEscape: false,
  overflows: false,
  ...over,
});
const press = (keys: string[], state = fresh, ctx = context()) => {
  let current = state;
  let effects: readonly unknown[] = [];
  for (const key of keys) {
    const result = handleKey(current, ctx, key);
    current = result.state;
    effects = result.effects;
  }
  return { state: current, effects };
};

spec(`${I}What each key does.Tab`, () => {
  test('Tab moves to the next control and wraps', () => {
    expect(press(['Tab']).state.focused).toBe('one');
    expect(press(['Tab', 'Tab']).state.focused).toBe('note');
    expect(press(['Tab', 'Tab', 'Tab', 'Tab', 'Tab']).state.focused).toBe('one');
  });
});

spec(`${I}What each key does.Up and Down`, () => {
  test('they move between controls while the drawing fits', () => {
    expect(press(['Tab', 'Down']).state.focused).toBe('note');
    expect(press(['Tab', 'Down', 'Up']).state.focused).toBe('one');
  });
  test('they scroll when the drawing has more rows than it can show', () => {
    expect(press(['Down'], fresh, context({ overflows: true })).effects).toEqual([
      { effect: 'scroll', by: 'lineDown' },
    ]);
  });
  test('in a multi-row Input they move between its rows and leave it from the first or last row', () => {
    const at = (isFirst: boolean, isLast: boolean) =>
      context({ inputRow: { isFirst, isLast, rows: 3 } });
    const inField: KeyState = { focused: 'note', chord: false };
    expect(press(['Down'], inField, at(true, false)).effects).toEqual([
      { effect: 'inputRow', direction: 'down' },
    ]);
    expect(press(['Down'], inField, at(false, true)).state.focused).toBe('size');
    expect(press(['Up'], inField, at(true, false)).state.focused).toBe('one');
  });
});

spec(`${I}What each key does.Enter`, () => {
  test('Enter presses a Button, submits an Input and picks in a Select', () => {
    const enterOn = (focused: string) => press(['Enter'], { focused, chord: false }).effects;
    expect(enterOn('one')).toEqual([{ effect: 'press', key: 'one' }]);
    expect(enterOn('note')).toEqual([{ effect: 'submit', key: 'note' }]);
    expect(enterOn('size')).toEqual([{ effect: 'pick', key: 'size' }]);
    expect(press(['Enter']).effects).toEqual([]);
  });
});

spec(`${I}What each key does.A button's hotkey`, () => {
  test('a hotkey presses its button, and while an Input has the focus every printable key goes to the field', () => {
    expect(press(['a']).effects).toEqual([{ effect: 'press', key: 'more' }]);
    expect(press(['a'], { focused: 'note', chord: false }).effects).toEqual([
      { effect: 'type', key: 'note', text: 'a' },
    ]);
  });
  test('in the VS Code extension and in a collapsed band a hotkey presses nothing', () => {
    expect(press(['a'], fresh, context({ surface: 'vscode' })).effects).toEqual([]);
    expect(press(['a'], fresh, context({ isBand: true, isCollapsed: true })).effects).toEqual([]);
  });
});

spec(`${I}What each key does.Page Up, Page Down, Home, and End`, () => {
  test('they scroll a drawing with more rows than it shows, and do nothing otherwise', () => {
    const long = context({ overflows: true });
    const by = (key: string) => press([key], fresh, long).effects;
    expect(by('PageUp')).toEqual([{ effect: 'scroll', by: 'pageUp' }]);
    expect(by('PageDown')).toEqual([{ effect: 'scroll', by: 'pageDown' }]);
    expect(by('Home')).toEqual([{ effect: 'scroll', by: 'top' }]);
    expect(by('End')).toEqual([{ effect: 'scroll', by: 'bottom' }]);
    expect(press(['PageDown']).effects).toEqual([]);
  });
});

spec(`${I}What each key does.Ctrl+X then an arrow key`, () => {
  test('Left or Up give the pane more room, Right or Down give it back', () => {
    const arrow = (key: string) => press(['Ctrl+X', key]).effects;
    expect(arrow('Left')).toEqual([{ effect: 'resize', direction: 'more' }]);
    expect(arrow('Up')).toEqual([{ effect: 'resize', direction: 'more' }]);
    expect(arrow('Right')).toEqual([{ effect: 'resize', direction: 'less' }]);
    expect(arrow('Down')).toEqual([{ effect: 'resize', direction: 'less' }]);
  });
  test('a pane beside the transcript stops widening at 45% of the terminal', () => {
    expect(maxPaneColumns(200)).toBe(90);
    expect(resizedColumns({ current: 85, direction: 'more', step: 10, terminalColumns: 200 })).toBe(
      90,
    );
    expect(resizedColumns({ current: 40, direction: 'less', step: 10, terminalColumns: 200 })).toBe(
      30,
    );
  });
});

spec(`${I}What each key does.Ctrl+X then X`, () => {
  test('it closes the pane even while a field has the focus', () => {
    expect(press(['Ctrl+X', 'X'], { focused: 'note', chord: false }).effects).toEqual([
      { effect: 'closePane' },
    ]);
  });
});

spec([`${I}What each key does.Ctrl+X then Ctrl+A`, `${I}When the user collapses the band`], () => {
  test('it toggles the band whoever has the focus, the prompt included', () => {
    const noFocus = context({ hasFocus: false });
    expect(press(['Ctrl+X', 'Ctrl+A'], fresh, noFocus).effects).toEqual([{ effect: 'toggleBand' }]);
  });
  test('the band stays collapsed until expanded, through /clear, and starts expanded', () => {
    const band = createBandState();
    expect(band.isCollapsed()).toBe(false);
    band.toggle();
    band.sessionReset();
    expect(band.isCollapsed()).toBe(true);
    band.toggle();
    expect(band.isCollapsed()).toBe(false);
    expect(createBandState().isCollapsed()).toBe(false);
  });
  test('Ctrl+X then Tab skips a collapsed band', () => {
    const collapsed = context({ isBand: true, isCollapsed: true });
    expect(press(['Ctrl+X', 'Tab'], fresh, collapsed).effects).toEqual([]);
    expect(press(['Ctrl+X', 'Tab']).effects).toEqual([{ effect: 'focusPane' }]);
  });
});

spec(`${I}What each key does.Esc`, () => {
  test('Esc returns the focus to the prompt, and with closeOnEscape also closes the pane', () => {
    const focused: KeyState = { focused: 'one', chord: false };
    expect(press(['Esc'], focused).effects).toEqual([{ effect: 'blur' }]);
    expect(press(['Esc'], focused, context({ closeOnEscape: true })).effects).toEqual([
      { effect: 'blur' },
      { effect: 'closePane' },
    ]);
    expect(press(['Esc'], focused).state.focused).toBeUndefined();
  });
});

describe('keys when the drawing has no focus', () => {
  test('keys go to the prompt, except the Ctrl+X chords', () => {
    const idle = context({ hasFocus: false });
    expect(press(['Tab'], fresh, idle).effects).toEqual([{ effect: 'toPrompt' }]);
    expect(press(['a'], fresh, idle).effects).toEqual([{ effect: 'toPrompt' }]);
  });
});

spec(`${I}How a pane gets keyboard focus`, () => {
  const base = {
    requested: true,
    fromUserAction: true,
    surface: 'terminal',
    isPromptEmpty: true,
    otherHasFocus: false,
  } as const;
  test('focus: true from a command or press is granted while the prompt is empty and nothing else has focus', () => {
    expect(grantsFocus(base)).toBe(true);
    expect(grantsFocus({ ...base, isPromptEmpty: false })).toBe(false);
    expect(grantsFocus({ ...base, otherHasFocus: true })).toBe(false);
    expect(grantsFocus({ ...base, fromUserAction: false })).toBe(false);
    expect(grantsFocus({ ...base, requested: false })).toBe(false);
  });
  test('a click gives focus, in the terminal only with fullscreen rendering', () => {
    expect(clickFocuses('terminal', true)).toBe(true);
    expect(clickFocuses('terminal', false)).toBe(false);
  });
  test('Ctrl+X then Tab focuses the pane', () => {
    expect(press(['Ctrl+X', 'Tab']).effects).toEqual([{ effect: 'focusPane' }]);
  });
});

spec(`${I}Set a hotkey and the first focus`, () => {
  test('autoFocus picks the control that has the focus when the pane opens, and does nothing in VS Code', () => {
    const t = node('Box', {
      children: [
        node('Button', { key: 'a', label: 'A' }),
        node('Input', { key: 'new', label: 'N', autoFocus: true }),
      ],
    });
    expect(initialFocus(t, 'terminal')).toBe('new');
    expect(initialFocus(t, 'vscode')).toBeUndefined();
    expect(initialFocus(tree(), 'terminal')).toBeUndefined();
  });
});

spec(`${I}Open a pane at the right time.columns`, () => {
  test('the width asked, or the width the user set instead, never above 45%', () => {
    const at = (asked?: number, userSet?: number) =>
      paneColumns({ asked, userSet, terminalColumns: 100 });
    expect(at(30)).toBe(30);
    expect(at(80)).toBe(45);
    expect(at(30, 40)).toBe(40);
    expect(at(30, 80)).toBe(45);
    expect(at()).toBeUndefined();
  });
});

spec(
  [
    'mods.troubleshoot.The band shows plugin panel hidden',
    'mods.troubleshoot.Hotkeys do nothing.The button is in a collapsed band',
  ],
  () => {
    test('a collapsed band is one dim row naming the keys, and no hotkey presses a button in it', () => {
      expect(collapsedRow()).toBe('▸ plugin panel hidden · ctrl+x ctrl+a or click to show');
      expect(collapsedRow('f2')).toBe('▸ plugin panel hidden · f2 or click to show');
      const band = context({ isBand: true, isCollapsed: true });
      expect(press(['a'], fresh, band).effects).toEqual([]);
    });
  },
);

spec('mods.troubleshoot.Hotkeys do nothing.No keyboard focus', () => {
  test('without keyboard focus a hotkey is a key for the prompt', () => {
    expect(press(['a'], fresh, context({ hasFocus: false })).effects).toEqual([
      { effect: 'toPrompt' },
    ]);
  });
});

spec('mods.troubleshoot.Hotkeys do nothing.In the VS Code extension', () => {
  test('buttons have no hotkeys there: Enter presses the focused one', () => {
    const vs = context({ surface: 'vscode' });
    expect(press(['a'], fresh, vs).effects).toEqual([]);
    expect(press(['Enter'], { focused: 'more', chord: false }, vs).effects).toEqual([
      { effect: 'press', key: 'more' },
    ]);
  });
});
