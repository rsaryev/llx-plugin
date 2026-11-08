# Judgments

Behaviour the kit decides where the official docs and types are silent (docs/SPEC.md). Each entry
names the code that holds it and why. A judgment is never counted as compatibility.

| Where                         | Judgment                                                                                          | Why                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/format/names.ts`         | The wording of the "not kebab-case" and "may not contain …" messages                              | The docs name the rules but quote no message for them                                     |
| `src/format/manifest.ts`      | The wording of "Unknown field", type-mismatch and missing-metadata messages                       | The docs say these are reported, not their text                                           |
| `src/format/paths.ts`         | The wording of "must start with ./" and "must be .md files"                                       | The docs state the rule; only the `..` message is quoted, and that one is used verbatim   |
| `src/format/manifest-schema.ts` | `author`, `dependencies` objects and `commands` entries are not strict (unknown keys dropped)   | "Unrecognized fields" lists the strict objects; these are not among them                  |
