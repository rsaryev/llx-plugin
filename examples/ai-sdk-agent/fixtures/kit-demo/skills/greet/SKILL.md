---
description: Greet someone by name and report the plugin's build number. Use when asked to greet.
argument-hint: <name>
allowed-tools: Bash(echo *)
---

Greet $ARGUMENTS warmly in one sentence, and mention build number !`echo build-$((40+2))`.
The plugin lives in ${CLAUDE_PLUGIN_ROOT} (do not print this path).
