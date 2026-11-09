# A plugin-running agent on the AI SDK

A small coding agent built with the [AI SDK](https://ai-sdk.dev) (`ai` 7, `@ai-sdk/anthropic`) that
runs Claude Code plugins through `@rsaryev/claude-plugin-kit`. It is about 600 lines: the kit does
the plugin work, the agent only supplies ports and a tool loop.

| Part           | File                              | What it does                                                                                                                        |
| -------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Ports          | `./src/ports.ts`                  | the plugin folder on disk, commands through `bash`, `fetch`, the process environment, the model for `prompt` hooks                  |
| Agent          | `./src/agent.ts`, `./src/turn.ts` | `loadPlugin`, `createPluginHost`, a session; `SessionStart`, `UserPromptSubmit`, `Stop` (looping while a hook blocks), `SessionEnd` |
| Built-in tools | `./src/tools.ts`                  | `Bash`, `Read`, `Write`, `Edit` under Claude Code's names; `session.checkTool` runs `PreToolUse` and the rules, then `PostToolUse`  |
| Permissions    | `./src/permissions.ts`            | the `permissions` of user, project and local settings, started in `--permission-mode` (`acceptEdits` by default)                    |
| Skills         | `./src/agent.ts`                  | listed to the model; the `Skill` tool and `/plugin:name` prompts call `session.expandSkill`                                         |
| Subagents      | `./src/subagent.ts`               | the `Agent` tool runs a plugin agent's definition, with `SubagentStart` and `SubagentStop`                                          |
| MCP            | `./src/mcp.ts`                    | starts each resolved plugin server with the official MCP client; tools as `mcp__plugin_<plugin>_<server>__<tool>`                   |
| Transcript     | `./src/transcript.ts`             | writes `transcript_path` in the JSONL shape plugins read                                                                            |

## Run

```sh
bun install            # at the repository root, then here
bun run corpus:fetch   # at the repository root: the official plugins the scenarios use
bun install            # here
bun run scenarios      # every scenario on Claude Haiku 5.5
bun src/cli.ts --plugin fixtures/kit-demo --cwd /tmp/work "/kit-demo:greet Alice"
```

The agent runs like `claude -p`: there is no one to answer a prompt, so a call the rules would ask
about does not run (`prompt-unavailable`). A skill's `` !`command` `` placeholder is decided by the
same rules, with the skill's `allowed-tools` added as allow rules.

The Anthropic key comes from `ANTHROPIC_API_KEY`, else from `~/.config/llx/key-anthropic`. The model
is `claude-haiku-5-5`.

## Scenarios

`scenarios/run.ts` runs each case in a fresh temporary folder and checks what happened:

| Plugin                     | Checks                                                                                                                                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `explanatory-output-style` | its `SessionStart` command hook adds context; the answer carries the `★ Insight` block                                                                                                                               |
| `commit-commands`          | `/commit-commands:commit` runs its `` !`git …` `` context and the agent commits                                                                                                                                      |
| `hookify`                  | a `.claude/hookify.*.local.md` rule blocks `rm -rf` through the plugin's Python hook                                                                                                                                 |
| `ralph-loop`               | a ` ```! ` setup block runs; its `Stop` hook feeds the prompt back exactly to `--max-iterations`                                                                                                                     |
| `frontend-design`          | the model picks the plugin's skill on its own and writes the page                                                                                                                                                    |
| `kit-demo` (fixture)       | `$ARGUMENTS` and `` !`cmd` ``; a `Stop` **prompt** hook evaluated by Haiku; `if: "Bash(curl *)"` deny; `PostToolUse` command and **http** hooks; a plugin agent as a subagent; an MCP server with `${user_config.*}` |

A plugin's `$ARGUMENTS` reaches its ` ```! ` commands as typed (skills.md), so a prompt to a plugin
like ralph-loop must not carry backticks or redirections: the shell runs them.
