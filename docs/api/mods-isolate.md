# `@rsaryev/llx-plugin/mods/isolate`

What code inside an isolate needs; nothing below it imports a `node:` or `bun` module or any package. The same names are in `./mods`.

One row per export; `scripts/check-docs.ts` (DOC3) keeps this table equal to the entry's exports.

| Name | Kind | What it is |
| --- | --- | --- |
| `acceptsField` | function | Whether the field `name` of `matcher` would let the value `actual` through, tested in this thread: the check behind the telemetry filter, which never needs an engine |
| `atom` | function | Declares a state atom with its key and initial value |
| `Atom` | type | What `atom` returns |
| `AtomKey` | type | `{ plugin, key }` as the type declaration file names a value; `id` names one member of a family |
| `borderOf` | function | The border a `Box` draws: its style when the docs name it, else none |
| `clientFailure` | function | What takes a failed `Client`'s place in the terminal: the line above as dimmed text, so "the rest of your drawing still shows" |
| `deepFreeze` | function | Freezes `value` and every plain object and array inside it, in place, and returns it |
| `DeepReadonly` | type | `T` with every property, element and nested value read-only |
| `defaultElementTable` | function | The elements `surface` draws (the check marks of the elements table) |
| `derive` | function | Declares a state value computed from other state sources |
| `Derived` | type | A value computed from others, again only once one of them changed |
| `drawsAsLink` | function | Whether a `Link` draws as a link |
| `elementFn` | function | The constructor of `name`, the one `$.ui.resolve(e)` hands out: what a host rebuilds from a name it got across a boundary |
| `ElementFn` | type | One element as `$.ui.resolve(e)` gives it: a function from props (and `children`) to a node |
| `elementNameOf` | function | The element `value` builds when it is one of the kit's constructors, else `undefined` |
| `ElementNode` | type | What an element function gives back: `{ type, props, children }`, the shape `find` of the test kit returns |
| `ElementTable` | type | The elements an app draws, by name: an element the app lacks is absent ("Apps other than the terminal have no `Raster`") |
| `EngineRef` | type | What `isEngineRef` returns |
| `Fragment` | function | `<>...</>`: "a column Box around the children" |
| `frozenCopy` | function | A frozen copy of every plain object and array in `value`: the event a host fires stays its own and can still change after the hooks ran |
| `h` | function | The JSX factory: "a plain-data element from a string tag or a component" |
| `INSTRUCTION_FILE_KINDS` | constant | Every tier an instruction file can belong to |
| `isElementNode` | function | An element: a known `type`, `props` that are a record and `children` that are a list |
| `isEngineRef` | function | Whether a value is a reference to an engine element |
| `isHookBody` | function | Whether a hook's answer is a body it streams: an async generator (or another async iterator with `next`), which is what a hook on a streaming event is |
| `joinHandlers` | function | The plain tree with each control's callbacks back on it, found by the control's key |
| `JsxTag` | type | A tag JSX compiles to: an element's name, one of its constructors, or a component of the mod's |
| `matchesEvent` | function | Whether `event` passes `matcher` in this thread: every field the matcher names lets the event's field through (a list, any of its values |
| `memberOf` | function | The member of `source` for the event's `requestId`; `source` itself when the event has none |
| `plainDataProblem` | function | The first limit `value` goes past, or `undefined` when it fits |
| `PlainDataProblem` | type | Which limit a value went past, first found |
| `Props` | type | The props of an element, as plain data and callbacks |
| `read` | function | The value, or the atom's default while nothing was written; a derived value is computed |
| `selects` | function | Whether `pattern` selects `event`: `*` every event but a telemetry one (`Glob`,:5346), `ns.*` every one under that namespace (`telemetry.*` the telemetry events) |
| `sizeProblem` | function | Why a tree is "not drawn", or `undefined` |
| `spacingCells` | function | The cells a spacing prop of a `Box` takes |
| `SpacingCells` | type | Terminal cells a spacing value is across and down |
| `splitHandlers` | function | The tree as plain data, and the callbacks it held by control key |
| `SplitTree` | type | A drawn tree as plain data, and its controls' callbacks apart, by the key each control is addressed by |
| `STATE_LIBRARY_SOURCE` | constant | The `$.state` helpers as JavaScript text, for a host that bundles a mod's modules for an isolate |
| `StateHost` | type | What the helpers need of `$`: its `state` namespace |
| `StateSource` | type | The `sources` field of `Derived` |
| `StateValue` | type | What `read` gives for a source: an atom's or a derived value's type; a bare key's is unknown |
| `textStyle` | function | How an app draws a `Text`'s weight and typography |
| `TextStyle` | type | What `textStyle` returns |
| `TIERS` | constant | The chain's five tiers, outermost first |
| `TreeChild` | type | The `children` field of `ElementNode` |
| `treeProblem` | function | Why `tree` is not a valid drawing of `site` for `surface`, or `undefined` |
| `UI_SURFACES` | constant | What the mods reference says about the interface, as data: the render sites with the fields of `e.props`, what `e.requestId` is and the apps that raise them |
| `UiSurface` | type | One of `UI_SURFACES` |
| `update` | function | Writes `change` of the current value and answers the new one; a shaped atom stores `{ shape, value }` |
