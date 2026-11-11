#!/bin/bash
# PostToolUse for Write|Edit: tells Claude which file changed, through additionalContext.
input=$(cat)
file=$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin)["tool_input"]["file_path"])')
printf '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"kit-demo noted a change to %s"}}' "$file"
