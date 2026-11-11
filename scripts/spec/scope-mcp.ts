/** The MCP pages of the audit (scripts/spec/scope.ts). */
import { NAVIGATION, type PageScope } from './scope.ts';

export const MCP_SCOPES: readonly PageScope[] = [
  {
    page: 'mcp.md',
    category: 'mcp',
    slug: 'behavior',
    routes: [
      {
        category: 'mcp-settings',
        heading:
          /^(Project server approvals and workspace trust|Disable a server without removing it|Local scope|Project scope|User scope|Scope hierarchy and precedence)$/,
      },
      { category: 'mcp-settings', parent: /^Environment variable expansion in \.mcp\.json$/ },
      { category: 'mcp-settings', heading: /^Environment variable expansion in \.mcp\.json$/ },
    ],
    skip: [
      [/^(What you can do with MCP|Find and build MCP servers)$/, 'advice'],
      [
        /^(Add a server from setup instructions written for another client|Add a server from a URL|Add a server from an npx, uvx, or binary command|Add a server from an mcpServers JSON block)$/,
        'tutorial',
      ],
      [
        /^(Managing your servers|Server status|Server status detail|Configuration warnings|Tool availability)$/,
        'ui',
      ],
      [
        /^(MCP client runtimes|Dynamic tool updates|Notification streams on the v2 runtime|Automatic reconnection|Mid-session drops of a remote server|Failed first connections|Stdio servers that exit or fail to start|Failed discovery requests|Retry failed servers yourself|How Claude learns that a server failed|How Claude Code stops a stdio server)$/,
        'runtime',
      ],
      [
        /^(Time limits on MCP tool calls|Automatic backgrounding of long tool calls|MCP tasks that run on the server|Stop an MCP task or get its result|Answer a question from an MCP task|Exit, clear, or resume while an MCP task runs|What a call needs to become an MCP task|Status messages on an MCP task|Time limits on MCP tasks|Make Claude wait for the result of an MCP task|MCP tasks for server authors|Answer the call with a task|Report status, results, and questions)$/,
        'runtime',
      ],
      ['Push messages with channels', 'duplicate'],
      [
        /^(Practical examples|Example: Connect to GitHub for code reviews|Example: Query your PostgreSQL database)$/,
        'tutorial',
      ],
      [
        /^(Authenticate from the command line|Sign in to an MCP server behind a gateway that requires a header)$/,
        'ui',
      ],
      ['Import MCP servers from Claude Desktop', 'runtime'],
      [
        /^(Use MCP servers from claude\.ai|How connectors reach Claude Code|Organization controls on connector tools|Disable claude\.ai connectors)$/,
        'service',
      ],
      [
        /^(Use Claude Code as an MCP server|Read a background command's output as an MCP client)$/,
        'runtime',
      ],
      [/^(Use MCP resources|Reference MCP resources)$/, 'ui'],
      [
        /^(Scale with MCP tool search|Tool search for MCP server authors|Change the description length limits|Mark a tool to load upfront or stay deferred|Configure tool search|Tool search through an LLM gateway|Tools that stay deferred below the ENABLE_TOOL_SEARCH=auto threshold|Exempt a server from deferral|Defer a server's tools)$/,
        'model',
      ],
      ['Answer an elicitation request in a cloud session', 'service'],
    ],
  },
  {
    page: 'managed-mcp.md',
    category: 'mcp-settings',
    slug: 'managed',
    skip: [
      ['Choose a pattern', 'advice'],
      ['Validate the configuration', 'machine'],
      ['Example configuration', 'tutorial'],
      ['How restrictions appear to users', 'ui'],
      ['Monitor MCP usage', 'telemetry'],
      ['Configuration summary', 'duplicate'],
      NAVIGATION,
    ],
  },
];
