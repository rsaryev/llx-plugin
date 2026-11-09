import type { Assert, Equal } from './type-equality.ts';

/**
 * What the mods reference says about the interface, as data (plugins/mods/reference.md, "Render
 * sites" and "Elements"): the render sites with the fields of `e.props`, what `e.requestId` is and the
 * apps that raise them; the elements with the apps that draw them, the props the VS Code extension
 * ignores, the `Box` border styles and spacing steps, and the `Text` values. Pure data.
 */
export const UI_SURFACES = ['terminal', 'desktop', 'vscode'] as const;
export type UiSurface = (typeof UI_SURFACES)[number];

/** What `e.requestId` of a `ui.render` event is. */
export const REQUEST_KINDS = [
  'pane-id',
  'instance',
  'message-id',
  'tool-call-id',
  'agent-id',
] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export interface RenderSiteDef {
  /**
   * The fields of `e.props` the table names. A row that describes its props in words ("The
   * reply's text", "The tool's name, input, and result") names none: the list is then empty
   * (judgment, spec/judgments.md).
   */
  readonly props: readonly string[];
  readonly request: RequestKind;
  readonly surfaces: readonly UiSurface[];
}

const ALL: readonly UiSurface[] = ['terminal', 'desktop', 'vscode'];
const TERMINAL_AND_DESKTOP: readonly UiSurface[] = ['terminal', 'desktop'];
const TERMINAL: readonly UiSurface[] = ['terminal'];

export const RENDER_SITES = {
  Pane: {
    props: ['title', 'isFocused', 'bodyColumns', 'placement', 'scroll', 'view'],
    request: 'pane-id',
    surfaces: ALL,
  },
  AbovePrompt: {
    props: ['hasSurvey', 'isWorking', 'maxRows', 'bodyColumns', 'scroll', 'view'],
    request: 'instance',
    surfaces: TERMINAL_AND_DESKTOP,
  },
  UserMessage: {
    props: ['text', 'origin', 'isExpanded', 'task', 'from'],
    request: 'message-id',
    surfaces: ALL,
  },
  AssistantMessage: { props: [], request: 'message-id', surfaces: ALL },
  ToolUse: { props: [], request: 'tool-call-id', surfaces: ALL },
  ToolResult: { props: [], request: 'tool-call-id', surfaces: ALL },
  ToolGroup: { props: [], request: 'tool-call-id', surfaces: ALL },
  CommandOutput: {
    props: ['command', 'text'],
    request: 'message-id',
    surfaces: TERMINAL_AND_DESKTOP,
  },
  AskUserQuestion: { props: [], request: 'tool-call-id', surfaces: ALL },
  ToolProgress: { props: ['kind'], request: 'tool-call-id', surfaces: TERMINAL },
  Spinner: { props: ['word', 'message', 'suffix', 'mode'], request: 'agent-id', surfaces: ALL },
  TurnDuration: { props: ['word', 'durationMs'], request: 'message-id', surfaces: TERMINAL },
  InfoNotice: { props: ['text', 'command'], request: 'message-id', surfaces: TERMINAL },
  SessionMode: { props: ['modes'], request: 'instance', surfaces: TERMINAL_AND_DESKTOP },
  PromptHint: {
    props: ['isDraft', 'isWorking', 'hint'],
    request: 'instance',
    surfaces: TERMINAL_AND_DESKTOP,
  },
} as const satisfies Readonly<Record<string, RenderSiteDef>>;

export type RenderSite = keyof typeof RENDER_SITES;
/** The 15 sites, in the order of the reference table. */
export const RENDER_SITE_NAMES = [
  'Pane',
  'AbovePrompt',
  'UserMessage',
  'AssistantMessage',
  'ToolUse',
  'ToolResult',
  'ToolGroup',
  'CommandOutput',
  'AskUserQuestion',
  'ToolProgress',
  'Spinner',
  'TurnDuration',
  'InfoNotice',
  'SessionMode',
  'PromptHint',
] as const;
/** @public Drift guard: the list names every key of the table. */
export type RenderSiteNamesMatch = Assert<Equal<(typeof RENDER_SITE_NAMES)[number], RenderSite>>;

export const ELEMENT_NAMES = [
  'Box',
  'Text',
  'Button',
  'Link',
  'Code',
  'Markdown',
  'Input',
  'Select',
  'Svg',
  'Client',
  'Raster',
  'Image',
] as const;
export type ElementName = (typeof ELEMENT_NAMES)[number];

/** The apps that draw each element (the check marks of the elements table). */
export const ELEMENT_SURFACES: { readonly [N in ElementName]: readonly UiSurface[] } = {
  Box: ALL,
  Text: ALL,
  Button: ALL,
  Link: ALL,
  Code: ALL,
  Markdown: ALL,
  Input: ALL,
  Select: ALL,
  Svg: ['desktop', 'vscode'],
  Client: TERMINAL_AND_DESKTOP,
  Raster: TERMINAL,
  Image: TERMINAL,
};

/**
 * The props the VS Code extension ignores: it draws the element as if they were left out
 * (reference.md, "Elements"). The terminal and the Desktop app ignore none the docs name.
 */
export const VSCODE_IGNORED: { readonly [N in ElementName]: readonly string[] } = {
  Box: ['position', 'top', 'left', 'right', 'bottom', 'alignSelf', 'borderDimColor', 'hover'],
  Text: ['size', 'mono', 'tabular', 'hover'],
  Button: ['hotkey', 'plain', 'autoFocus', 'action', 'hover', 'variant', 'role'],
  Link: [],
  Code: ['language', 'path', 'startLine', 'format', 'wrap'],
  Markdown: [],
  Input: ['autoFocus', 'rows'],
  Select: ['autoFocus'],
  Svg: ['isInteractive'],
  Client: [],
  Raster: [],
  Image: [],
};

/** `Box` `borderStyle` names; any other value draws no border (reference.md, "`Box` border styles"). */
export const BORDER_STYLES = [
  'single',
  'double',
  'round',
  'bold',
  'singleDouble',
  'doubleSingle',
  'classic',
  'arrow',
  'dashed',
  'quote',
] as const;
export type BorderStyle = (typeof BORDER_STYLES)[number];

/** What each spacing step is, in terminal cells (reference.md, "`Box` spacing steps"). */
export const SPACING_STEPS = {
  xs: { across: 1, down: 0 },
  sm: { across: 1, down: 0 },
  md: { across: 2, down: 1 },
  lg: { across: 3, down: 1 },
  xl: { across: 4, down: 2 },
} as const satisfies Readonly<Record<string, { across: number; down: number }>>;
export type SpacingStep = keyof typeof SPACING_STEPS;

export const FLEX_DIRECTIONS = ['row', 'column', 'row-reverse', 'column-reverse'] as const;
export const TEXT_WRAPS = [
  'wrap',
  'truncate',
  'truncate-start',
  'truncate-middle',
  'truncate-end',
] as const;
export const TEXT_SIZES = ['caption', 'footnote', 'body', 'heading', 'title'] as const;
export const TEXT_WEIGHTS = ['regular', 'medium', 'semibold', 'bold'] as const;
export const BUTTON_VARIANTS = ['primary', 'secondary'] as const;
export const BUTTON_ROLES = ['dismiss'] as const;
