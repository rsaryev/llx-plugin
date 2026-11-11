/**
 * `@rsaryev/llx-plugin/mods/elements`: the element table of mods and the checks of a drawn tree
 * (plugins/mods/interface.md), for a UI process. A leaf: no host, no port, no `node:` import. The
 * same names are in `./mods` with the rest of the mods interface.
 */
export * from '../mods/ui/elements/index.ts';
/** The surfaces a mod draws on (`$.session.surfaces()`, a render hook's `e.surface`): the one list. */
export { UI_SURFACES, type UiSurface } from '../protocol/mods-ui-names.ts';
