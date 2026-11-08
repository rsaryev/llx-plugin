import type { Settings } from '../../protocol/official.ts';
import type { PolicyScope } from '../layers.ts';
import type { PolicyView } from '../view.ts';

export type WorkflowSize = NonNullable<Settings['workflowSizeGuideline']>;

/** What the host tells the size guideline besides the layers. */
export interface WorkflowSizeContext {
  /** Pro signed in: the default is `small` there (settings-reference.md, `workflowSizeGuideline`). */
  readonly plan: { readonly pro: boolean };
  /**
   * The Dynamic workflow size choice of `/config`, which Claude Code keeps in `~/.claude.json`: a file
   * the kit never reads, so the host hands the value over.
   */
  readonly configChoice?: WorkflowSize | undefined;
}

/** Where the size in force comes from. */
export type WorkflowSizeSource = 'settings' | 'config' | 'default';

export interface WorkflowSizeDecision {
  readonly size: WorkflowSize;
  readonly source: WorkflowSizeSource;
  /** The file that set it, when `source` is `settings`. */
  readonly settingsScope: PolicyScope | undefined;
  /** Claude aims for fewer agents than this; none for `unrestricted`. */
  readonly agentsBelow: number | undefined;
  /** Advice sent to Claude, "not an enforced cap". */
  readonly enforced: false;
  /** Whether `/config` shows its Dynamic workflow size row: hidden while a settings file sets the key. */
  readonly configRowVisible: boolean;
  /** The agent count above which the progress line shows `Large workflow` (workflows.md, "Cost"). */
  readonly largeWorkflowThreshold: number;
}

/** "fewer than 5", "fewer than 10", "fewer than 50" (workflows.md, "Set a size guideline"). */
const AGENTS_BELOW: { readonly [S in WorkflowSize]: number | undefined } = {
  unrestricted: undefined,
  small: 5,
  medium: 10,
  large: 50,
};

/** The built-in threshold of the `Large workflow` warning (workflows.md, "Cost"). */
const DEFAULT_THRESHOLD = 25;

const defaultSize = (pro: boolean): WorkflowSize => (pro ? 'small' : 'medium');

/**
 * The size guideline in force: a value in a settings file, else the `/config` choice, else the default
 * (`medium`, `small` on Pro). A value of another shape was dropped when the file was read, so it never
 * reaches here. A size the user chose replaces the 25-agent threshold with its own agent count;
 * `unrestricted` has none, so it leaves 25 (spec/judgments.md).
 */
export function workflowSize(view: PolicyView, context: WorkflowSizeContext): WorkflowSizeDecision {
  const holder = view.winner('workflowSizeGuideline');
  const chosen = holder?.value ?? context.configChoice;
  const size = chosen ?? defaultSize(context.plan.pro);
  const source: WorkflowSizeSource = holder ? 'settings' : chosen ? 'config' : 'default';
  const agentsBelow = AGENTS_BELOW[size];
  return {
    size,
    source,
    settingsScope: holder?.scope,
    agentsBelow,
    enforced: false,
    configRowVisible: holder === undefined,
    largeWorkflowThreshold:
      chosen === undefined ? DEFAULT_THRESHOLD : (agentsBelow ?? DEFAULT_THRESHOLD),
  };
}
