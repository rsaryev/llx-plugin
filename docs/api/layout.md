# `@rsaryev/llx-plugin/layout`

The standard layout of a plugin, without the plugin engine; these names are not in `./format`.

One row per export; `scripts/check-docs.ts` (DOC3) keeps this table equal to the entry's exports.

| Name | Kind | What it is |
| --- | --- | --- |
| `COMBINE_MODES` | constant | How a manifest key combines with the default location: `replace`, `add` or `merge` |
| `CombineMode` | type | One of `COMBINE_MODES` |
| `COMPONENT_KINDS` | constant | The standard layout: the default location of each component under the plugin root, the manifest key that points elsewhere |
| `ComponentKind` | type | One of `COMPONENT_KINDS` |
| `componentsAt` | function | The component kinds a directory listing shows at the plugin root, by their default locations (the manifest's `.claude-plugin/` folder is not a component) |
| `declaredKey` | function | The first manifest key of a kind that is set, with its value; `undefined` when none is |
| `LayoutEntry` | type | Where one component kind lives in a plugin: its default location, whether it is a folder, its manifest keys and how they combine |
| `ManifestKey` | type | A manifest key that names a component, written as the docs write it (`experimental.themes`) |
| `STANDARD_LAYOUT` | constant | The standard layout of a plugin: one `LayoutEntry` per component kind |
