import { addDir } from './add-dir.ts';
import { agent, agents } from './agents.ts';
import { channels, developmentChannels } from './channels.ts';
import { mcpConfig, strictMcpConfig } from './mcp.ts';
import { bare, disableSlashCommands, restricted, safeMode } from './modes.ts';
import { pluginDir, pluginUrl } from './plugins.ts';
import { permissionMode, tools } from './session.ts';
import { settings, settingSources } from './settings.ts';
import {
  appendSubagentPrompt,
  appendSubagentPromptFile,
  forwardSubagentText,
} from './subagent-prompt.ts';
import type { FlagName, FlagStrategy } from './types.ts';

/**
 * One strategy per flag (cli-reference.md, "CLI flags"). A flag added to `FLAG_NAMES` fails the
 * typecheck until it has a row; the session plan never switches on a flag's name.
 */
export const FLAG_STRATEGIES: { readonly [F in FlagName]: FlagStrategy<F> } = {
  '--plugin-dir': pluginDir,
  '--plugin-url': pluginUrl,
  '--bare': bare,
  '--safe-mode': safeMode,
  '--restricted': restricted,
  '--setting-sources': settingSources,
  '--settings': settings,
  '--disable-slash-commands': disableSlashCommands,
  '--add-dir': addDir,
  '--agent': agent,
  '--agents': agents,
  '--append-subagent-system-prompt': appendSubagentPrompt,
  '--append-subagent-system-prompt-file': appendSubagentPromptFile,
  '--forward-subagent-text': forwardSubagentText,
  '--channels': channels,
  '--dangerously-load-development-channels': developmentChannels,
  '--mcp-config': mcpConfig,
  '--strict-mcp-config': strictMcpConfig,
  '--permission-mode': permissionMode,
  '--tools': tools,
};
