/** The tool name an entry of a tool list or flag spells: `Bash(git push *)` names `Bash`. */
export const toolNameOfEntry = (entry: string): string => {
  const open = entry.indexOf('(');
  return (open === -1 ? entry : entry.slice(0, open)).trim();
};

const MCP_PREFIX = 'mcp__';

/** An MCP tool: `mcp__<server>__<tool>`. */
export const isMcpToolName = (toolName: string): boolean => toolName.startsWith(MCP_PREFIX);
