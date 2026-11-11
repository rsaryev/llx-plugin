# `@rsaryev/llx-plugin/mods/elements`

The element table of mods and the checks of a drawn tree, for a UI process: no host, no port and no `node:` import. The same names are in `./mods`.

One row per export; `scripts/check-docs.ts` (DOC3) keeps this table equal to the entry's exports.

| Name | Kind | What it is |
| --- | --- | --- |
| `borderOf` | function | The border a `Box` draws: its style when the docs name it, else none |
| `clientFailure` | function | What takes a failed `Client`'s place in the terminal: the line above as dimmed text, so "the rest of your drawing still shows" |
| `defaultElementTable` | function | The elements `surface` draws (the check marks of the elements table) |
| `drawsAsLink` | function | Whether a `Link` draws as a link |
| `elementFn` | function | The constructor of `name`, the one `$.ui.resolve(e)` hands out: what a host rebuilds from a name it got across a boundary |
| `ElementFn` | type | One element as `$.ui.resolve(e)` gives it: a function from props (and `children`) to a node |
| `elementNameOf` | function | The element `value` builds when it is one of the kit's constructors, else `undefined` |
| `ElementNode` | type | What an element function gives back: `{ type, props, children }`, the shape `find` of the test kit returns |
| `ElementTable` | type | The elements an app draws, by name: an element the app lacks is absent ("Apps other than the terminal have no `Raster`") |
| `EngineRef` | type | What `isEngineRef` returns |
| `Fragment` | function | `<>...</>`: "a column Box around the children" |
| `h` | function | The JSX factory: "a plain-data element from a string tag or a component" |
| `isElementNode` | function | An element: a known `type`, `props` that are a record and `children` that are a list |
| `isEngineRef` | function | Whether a value is a reference to an engine element |
| `joinHandlers` | function | The plain tree with each control's callbacks back on it, found by the control's key |
| `JsxTag` | type | A tag JSX compiles to: an element's name, one of its constructors, or a component of the mod's |
| `Props` | type | The props of an element, as plain data and callbacks |
| `sizeProblem` | function | Why a tree is "not drawn", or `undefined` |
| `spacingCells` | function | The cells a spacing prop of a `Box` takes |
| `SpacingCells` | type | Terminal cells a spacing value is across and down |
| `splitHandlers` | function | The tree as plain data, and the callbacks it held by control key |
| `SplitTree` | type | A drawn tree as plain data, and its controls' callbacks apart, by the key each control is addressed by |
| `textStyle` | function | How an app draws a `Text`'s weight and typography |
| `TextStyle` | type | What `textStyle` returns |
| `TreeChild` | type | The `children` field of `ElementNode` |
| `treeProblem` | function | Why `tree` is not a valid drawing of `site` for `surface`, or `undefined` |
| `UI_SURFACES` | constant | What the mods reference says about the interface, as data: the render sites with the fields of `e.props`, what `e.requestId` is and the apps that raise them |
| `UiSurface` | type | One of `UI_SURFACES` |
