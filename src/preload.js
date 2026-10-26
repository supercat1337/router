// @ts-check

/**
 * @typedef {import('./types.js').Node} Node
 * @typedef {import('./types.js').PreloadContext} PreloadContext
 */

/**
 * Default preload: prefer `leaf.preload(ctx)`, fall back to `leaf.load()`.
 * Both are app-owned metadata on `file()` — not part of the public type.
 *
 * `leaf.preload` receives `ctx` (with `signal`); `leaf.load` is called
 * **without** arguments — `import()` does not accept an `AbortSignal`.
 *
 * Shared by `attachPreload` (hover/focus) and `router.prefetch` (programmatic).
 * Both are opportunistic — errors are handled by the caller, not here.
 *
 * @internal
 * @param {Node} leaf
 * @param {PreloadContext} ctx
 * @returns {void | Promise<unknown>}
 */
export function defaultPreload(leaf, ctx) {
    const meta = /** @type {any} */ (leaf);
    if (typeof meta.preload === 'function') return meta.preload(ctx);
    if (typeof meta.load === 'function') return meta.load();
    return undefined;
}
