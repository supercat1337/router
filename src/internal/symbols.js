// @ts-check

/**
 * Runtime brand symbols for nominally-typed artifacts.
 *
 * Exported from an internal module (not from the public entry). This lets
 * `types.ts` reference them as computed keys in branded interfaces, while
 * api-extractor inlines them as non-exported `declare const` declarations
 * in the rolled-up `.d.ts`. Consumers can narrow with `isMap`/`isRedirect`,
 * but cannot forge branded values by hand.
 */

/** @type {unique symbol} */
export const FILE_BRAND = Symbol("spa-router.file");

/** @type {unique symbol} */
export const FOLDER_BRAND = Symbol("spa-router.folder");

/** @type {unique symbol} */
export const MAP_BRAND = Symbol("spa-router.map");

/** @type {unique symbol} */
export const REDIRECT_BRAND = Symbol("spa-router.redirect");
