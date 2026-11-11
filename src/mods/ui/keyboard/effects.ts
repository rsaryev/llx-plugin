/** What a key does while a pane or the band has keyboard focus (interface.md, "What each key does"). */
export type KeyEffect =
  | { readonly effect: 'focus'; readonly key: string }
  | { readonly effect: 'press'; readonly key: string }
  | { readonly effect: 'submit'; readonly key: string }
  | { readonly effect: 'pick'; readonly key: string }
  | { readonly effect: 'type'; readonly key: string; readonly text: string }
  | { readonly effect: 'inputRow'; readonly direction: 'up' | 'down' }
  | {
      readonly effect: 'scroll';
      readonly by: 'lineUp' | 'lineDown' | 'pageUp' | 'pageDown' | 'top' | 'bottom';
    }
  | { readonly effect: 'resize'; readonly direction: 'more' | 'less' }
  | { readonly effect: 'closePane' }
  | { readonly effect: 'toggleBand' }
  | { readonly effect: 'focusPane' }
  | { readonly effect: 'blur' }
  | { readonly effect: 'toPrompt' };

/** The keys the table names, as the host reports them; any other single character is printable. */
export const NAMED_KEYS = [
  'Tab',
  'Up',
  'Down',
  'Left',
  'Right',
  'Enter',
  'Esc',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  'Ctrl+X',
  'Ctrl+A',
] as const;
export type NamedKey = (typeof NAMED_KEYS)[number];

export const isNamedKey = (key: string): key is NamedKey => NAMED_KEYS.some((n) => n === key);
