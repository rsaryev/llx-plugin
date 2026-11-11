import { PERMISSION_MODE_INPUTS, type PermissionModeInput } from '../../agents/permission-mode.ts';
import type { PermissionMode } from '../../protocol/official.ts';
import type { DocumentedTool } from '../../protocol/tool-names.ts';
import { refuse, type Contribution, type FlagContext } from './types.ts';

/**
 * `--permission-mode` and `--tools` (cli-reference.md, "CLI flags"). `--permission-mode` "accepts
 * `default`, `acceptEdits`, `plan`, `auto`, `dontAsk`, `bypassPermissions`, or `manual` as an alias
 * for `default`" and "overrides `defaultMode` from settings files"; a `--restricted` session "refuses
 * `bypassPermissions`". `--tools` "restricts which built-in tools Claude can use": `""` disables
 * all, `"default"` is the default set, or tool names like `"Bash,Edit,Read"`; naming a task-tracking
 * tool "also opts the session in". The wording of a refusal is in spec/judgments.md.
 */

const isInput = (value: string): value is PermissionModeInput =>
  PERMISSION_MODE_INPUTS.some((input) => input === value);

/** `manual` is "an alias for `default`"; every other input is a mode. */
const MODE_OF: { readonly [I in PermissionModeInput]: PermissionMode } = {
  default: 'default',
  manual: 'default',
  acceptEdits: 'acceptEdits',
  bypassPermissions: 'bypassPermissions',
  plan: 'plan',
  dontAsk: 'dontAsk',
  auto: 'auto',
};

export function permissionMode(value: string, context: FlagContext): Contribution {
  if (!isInput(value)) {
    return refuse(
      `Error: Invalid permission mode: ${value}. Use one of: ${PERMISSION_MODE_INPUTS.join(', ')}`,
    );
  }
  const mode = MODE_OF[value];
  if (mode === 'bypassPermissions' && context.given['--restricted'] === true) {
    return refuse('Error: --restricted refuses --permission-mode bypassPermissions');
  }
  return { permissionMode: mode };
}

/** The task-tracking tools: naming one in `--tools` opts the session in (tools-reference.md, "Task tool availability"). */
const TASK_TOOLS = [
  'TaskCreate',
  'TaskGet',
  'TaskUpdate',
  'TaskList',
  'TodoWrite',
] as const satisfies readonly DocumentedTool[];

const TASK_TOOL_NAMES: ReadonlySet<string> = new Set(TASK_TOOLS);

const SEPARATORS = /[\s,]+/;

export function tools(value: string): Contribution {
  const names = value.split(SEPARATORS).filter((name) => name !== '');
  return { tools: names, optsIntoTaskTools: names.some((name) => TASK_TOOL_NAMES.has(name)) };
}
