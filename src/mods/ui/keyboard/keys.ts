import { hotkeyTable, type HotkeyContext } from '../controls/hotkeys.ts';
import { collectControls, controlKey, type Control, type ControlType } from '../controls/keys.ts';
import type { UiSurface } from '../../../protocol/mods-ui-names.ts';
import { isNamedKey, type KeyEffect, type NamedKey } from './effects.ts';

export interface KeyState {
  /** The key of the focused control, if one has the focus. */
  readonly focused: string | undefined;
  /** Ctrl+X was pressed: the next key finishes a chord. */
  readonly chord: boolean;
}

export interface KeyContext {
  readonly tree: unknown;
  readonly surface: UiSurface;
  /** The drawing is the band above the prompt. */
  readonly isBand: boolean;
  readonly isCollapsed: boolean;
  /** The pane or band has keyboard focus. */
  readonly hasFocus: boolean;
  readonly closeOnEscape: boolean;
  /** "When the pane or band has more rows than it can show", Up, Down and the page keys scroll it. */
  readonly overflows: boolean;
  /** The focused `Input` shows several rows, and the row the caret is on. */
  readonly inputRow?: {
    readonly isFirst: boolean;
    readonly isLast: boolean;
    readonly rows: number;
  };
}

export interface KeyResult {
  readonly state: KeyState;
  readonly effects: readonly KeyEffect[];
}

const NONE: readonly KeyEffect[] = [];

/** Which controls take typed text: "While an `Input` has the focus, every printable key goes to the field". */
const TEXT_CONTROLS: { readonly [T in ControlType]: boolean } = {
  Button: false,
  Input: true,
  Select: false,
};
const takesText = (control: Control | undefined): control is Control =>
  control !== undefined && TEXT_CONTROLS[control.type];

/** The control that has the focus: "Tab: Moves to the next control" counts the controls with a key. */
function focusedControl(controls: readonly Control[], state: KeyState): Control | undefined {
  return controls.find((c) => c.key === state.focused);
}

/** The control at `step` from the focused one, wrapping for Tab; without a wrap Up and Down stop at the ends. */
function neighbour(
  controls: readonly Control[],
  state: KeyState,
  step: 1 | -1,
  wraps: boolean,
): string | undefined {
  if (controls.length === 0) return undefined;
  const at = controls.findIndex((c) => c.key === state.focused);
  const next = at === -1 ? (step === 1 ? 0 : controls.length - 1) : at + step;
  const bounded = wraps ? (next + controls.length) % controls.length : next;
  return controls[bounded]?.key;
}

const moveTo = (state: KeyState, key: string | undefined): KeyResult =>
  key === undefined
    ? { state, effects: NONE }
    : { state: { ...state, focused: key }, effects: [{ effect: 'focus', key }] };

type Handler = (state: KeyState, context: KeyContext, controls: readonly Control[]) => KeyResult;

const same = (state: KeyState, ...effects: KeyEffect[]): KeyResult => ({ state, effects });

/** Up and Down: rows of an `Input` first, then the scroll of a long drawing, else the neighbouring control. */
function vertical(step: 1 | -1): Handler {
  const direction = step === 1 ? 'down' : 'up';
  return (state, context, controls) => {
    const row = context.inputRow;
    const inField = takesText(focusedControl(controls, state)) && row !== undefined;
    const atEdge = row !== undefined && (step === 1 ? row.isLast : row.isFirst);
    if (inField && !atEdge) return same(state, { effect: 'inputRow', direction });
    if (!inField && context.overflows) {
      return same(state, { effect: 'scroll', by: step === 1 ? 'lineDown' : 'lineUp' });
    }
    return moveTo(state, neighbour(controls, state, step, false));
  };
}

const scrolling =
  (by: 'pageUp' | 'pageDown' | 'top' | 'bottom'): Handler =>
  (state, context) =>
    context.overflows ? same(state, { effect: 'scroll', by }) : same(state);

function enter(state: KeyState, _context: KeyContext, controls: readonly Control[]): KeyResult {
  const type = focusedControl(controls, state)?.type;
  const key = state.focused;
  if (type === undefined || key === undefined) return same(state);
  const effect = { Button: 'press', Input: 'submit', Select: 'pick' } as const;
  return same(state, { effect: effect[type], key });
}

const escape: Handler = (state, context) =>
  context.closeOnEscape
    ? {
        state: { ...state, focused: undefined },
        effects: [{ effect: 'blur' }, { effect: 'closePane' }],
      }
    : { state: { ...state, focused: undefined }, effects: [{ effect: 'blur' }] };

const HANDLERS: { readonly [K in NamedKey]?: Handler } = {
  Tab: (state, _context, controls) => moveTo(state, neighbour(controls, state, 1, true)),
  Up: vertical(-1),
  Down: vertical(1),
  Enter: enter,
  Esc: escape,
  PageUp: scrolling('pageUp'),
  PageDown: scrolling('pageDown'),
  Home: scrolling('top'),
  End: scrolling('bottom'),
};

/** A printable key: into the focused field, else a button's hotkey. */
function printable(
  state: KeyState,
  context: KeyContext,
  controls: readonly Control[],
  text: string,
): KeyResult {
  const focused = focusedControl(controls, state);
  if (takesText(focused)) return same(state, { effect: 'type', key: focused.key, text });
  const hot: HotkeyContext = { ...context, isInputFocused: false };
  const button = hotkeyTable(context.tree, hot).get(text);
  const key = button === undefined ? undefined : controlKey(button);
  return key === undefined ? same(state) : same(state, { effect: 'press', key });
}

/** The key that finishes a chord that began with Ctrl+X. */
const CHORDS: { readonly [key: string]: (context: KeyContext) => KeyEffect | undefined } = {
  x: () => ({ effect: 'closePane' }),
  X: () => ({ effect: 'closePane' }),
  'Ctrl+A': () => ({ effect: 'toggleBand' }),
  Tab: (context) => (context.isBand && context.isCollapsed ? undefined : { effect: 'focusPane' }),
  Left: () => ({ effect: 'resize', direction: 'more' }),
  Up: () => ({ effect: 'resize', direction: 'more' }),
  Right: () => ({ effect: 'resize', direction: 'less' }),
  Down: () => ({ effect: 'resize', direction: 'less' }),
};

function finishChord(state: KeyState, context: KeyContext, key: string): KeyResult {
  const effect = CHORDS[key]?.(context);
  const done = { ...state, chord: false };
  return effect === undefined ? same(done) : same(done, effect);
}

/**
 * What one key does (interface.md, "What each key does"). Ctrl+X then X, an arrow key, Tab or Ctrl+A
 * work as chords, and Ctrl+X then Ctrl+A "also work while the prompt has the focus"; every other key
 * reaches the drawing only while it has keyboard focus ("The rest of the time, keys go to the
 * prompt"). Tab and the arrow keys cannot be bound to anything else by a mod: they are never
 * printable here.
 */
export function handleKey(state: KeyState, context: KeyContext, key: string): KeyResult {
  if (state.chord) return finishChord(state, context, key);
  if (key === 'Ctrl+X') return same({ ...state, chord: true });
  if (key === 'Ctrl+A') return same(state, { effect: 'toPrompt' });
  if (!context.hasFocus) return same(state, { effect: 'toPrompt' });
  const controls = collectControls(context.tree);
  if (isNamedKey(key)) return (HANDLERS[key] ?? (() => same(state)))(state, context, controls);
  return printable(state, context, controls, key);
}
