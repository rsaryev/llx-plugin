import type { PermissionMode } from '../../src/protocol/official.ts';
import { resolveSubagentTools } from '../../src/agents/tool-resolution.ts';

/**
 * A subagent request as the tool-table tests write it: the session's tool names, the definition's two
 * fields and what the run is. `resolveSubagentTools` takes the pool in two parts and the run as
 * a whole, so this builds both; the outcome comes back as the tools and the refusal as an issue.
 */
export interface SubagentRequest {
  readonly name?: string;
  readonly tools?: readonly string[];
  readonly disallowedTools?: readonly string[];
  readonly sessionTools: readonly string[];
  readonly background?: boolean;
  readonly permissionMode?: PermissionMode;
  readonly atDepthLimit?: boolean;
  readonly ownWorkingDirectory?: boolean;
  readonly handback?: boolean;
}

export function resolveRequest(request: SubagentRequest) {
  const isMcp = (name: string): boolean => name.startsWith('mcp__');
  const outcome = resolveSubagentTools(
    {
      name: request.name ?? 'agent',
      ...(request.tools && { tools: [...request.tools] }),
      ...(request.disallowedTools && { disallowedTools: [...request.disallowedTools] }),
    },
    {
      builtin: request.sessionTools.filter((name) => !isMcp(name)),
      mcp: request.sessionTools
        .filter(isMcp)
        .map((name) => ({ server: name.split('__')[1] ?? '', name })),
    },
    {
      kind: 'subagent',
      background: request.background !== false,
      atDepthLimit: request.atDepthLimit === true,
      permissionMode: request.permissionMode ?? 'default',
      asMainThread: false,
      ...(request.handback !== undefined && { handback: request.handback }),
      ...(request.ownWorkingDirectory !== undefined && {
        ownWorkingDirectory: request.ownWorkingDirectory,
      }),
    },
  );
  return outcome.ok
    ? { tools: outcome.tools, issues: [] }
    : {
        tools: [],
        issues: [{ severity: 'error', path: 'tools', message: outcome.refusal.message }],
      };
}
