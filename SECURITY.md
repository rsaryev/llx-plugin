# Security

llx-plugin runs what a plugin declares: hooks, shell commands in skills, MCP servers. What a plugin
can do to the host is the package's business. Where the kit is stricter than Claude Code, and the
risks it leaves to the host, are in [docs/SECURITY.md](docs/SECURITY.md).

## Reporting a problem

Report it privately, not in an issue:
[open a security advisory](https://github.com/rsaryev/llx-plugin/security/advisories/new).
Say which plugin files and settings you loaded, through which call, and what happened. The latest
release is the one that gets the fix.
