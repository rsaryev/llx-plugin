# Judgments

Behaviour the kit decides where the official docs and types are silent (docs/SPEC.md). Each entry
names the code that holds it and why. A judgment is never counted as compatibility.

| Where                         | Judgment                                                                                          | Why                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/format/names.ts`         | The wording of the "not kebab-case" and "may not contain …" messages                              | The docs name the rules but quote no message for them                                     |
| `src/format/manifest.ts`      | The wording of "Unknown field", type-mismatch and missing-metadata messages                       | The docs say these are reported, not their text                                           |
| `src/format/paths.ts`         | The wording of "must start with ./" and "must be .md files"                                       | The docs state the rule; only the `..` message is quoted, and that one is used verbatim   |
| `src/format/manifest-schema.ts` | `author`, `dependencies` objects and `commands` entries are not strict (unknown keys dropped)   | "Unrecognized fields" lists the strict objects; these are not among them                  |
| `src/format/frontmatter.ts` | A block with no closing `---` is not frontmatter (the whole file is body); the closing marker is the first later line that is only `---`; a leading byte order mark is ignored; an empty block is present with no fields | skills.md fixes only the opening line and the unparseable-YAML case |
| `src/format/frontmatter.ts` | YAML is read with the 1.2 core schema (`yes`/`on` stay strings; a duplicate key does not parse) | The docs list the flag spellings but not the parser |
| `src/format/frontmatter-values.ts` | How a bad value is reported (the wording of each reason), that a number or boolean is read as text, that an enum matches exactly with no case folding, and that blank text is absent | The docs name the accepted spellings, not what happens to the rest |
| `src/format/frontmatter.ts` | A block that parses to a list or a single value is `not-a-table`: the file loads with no fields, like unparseable YAML; `line` and `column` count from the opening `---` as line 1 | The docs name only the unparseable case and send users to the parse error, not where it is |
| `src/format/frontmatter-values.ts` | `readInteger` takes a YAML number or a string of digits that is a safe integer, and reports a value outside `min`/`max` as dropped; `readList` has no default separator mode, each field picks one | The docs name the numeric limits and the list spellings per field, not how a bad one is handled |
