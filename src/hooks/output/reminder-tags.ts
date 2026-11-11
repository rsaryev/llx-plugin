/**
 * hooks.md, "JSON output": "If your string contains a `<system-reminder>` or `</system-reminder>`
 * tag, Claude receives the string with that tag's `<` replaced by `&lt;`." The context of a
 * foreground hook and of a background one go through this one replacement.
 */
const SYSTEM_REMINDER_TAG = /<(\/?system-reminder>)/g;

export const escapeReminderTags = (text: string): string =>
  text.replace(SYSTEM_REMINDER_TAG, '&lt;$1');
