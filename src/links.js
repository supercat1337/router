// @ts-check

/**
 * @typedef {import('./types.js').Router} Router
 * @typedef {import('./types.js').AttachLinksOptions} AttachLinksOptions
 */

const SELECTOR = '[data-router-link]';

/**
 * Attach a single delegated click listener on `document` that intercepts
 * clicks on `[data-router-link]` elements and routes them through the SPA
 * router. `[data-router-link="replace"]` uses `router.replace`; any other
 * value (including empty) uses `router.navigate`.
 *
 * Returns a `detach` function. SSR-safe: outside the browser returns a no-op.
 *
 * All URL-related checks live in `router.adapter.normalize(href)`. This
 * module only decides whether the browser should handle the click itself
 * (defaultPrevented, modifier keys, target, download, missing href).
 *
 * `href` is read via `getAttribute`, not the `.href` property (which
 * resolves to an absolute URL). `router.navigate`/`replace` receive an RRU.
 *
 * @param {Router} router
 * @param {AttachLinksOptions} [options]
 * @returns {() => void}
 */
export function attachLinks(router, options = {}) {
    if (typeof document === 'undefined' || !document.addEventListener) {
        return () => {};
    }

    /**
     * @param {MouseEvent} e
     */
    function onClick(e) {
        if (e.defaultPrevented) return;
        if (e.button !== 0) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

        const target = /** @type {EventTarget | null} */ (e.target);
        if (!target || typeof (/** @type {any} */ (target).closest) !== 'function') {
            return;
        }

        const el = /** @type {Element | null} */ (/** @type {any} */ (target).closest(SELECTOR));
        if (!el) return;

        const tgt = el.getAttribute('target');
        if (tgt && tgt !== '_self') return;
        if (el.hasAttribute('download')) return;

        const href = el.getAttribute('href');
        if (!href) return;

        const rru = router.adapter.normalize(href);
        if (rru === null) return;

        e.preventDefault();

        const raw = /** @type {any} */ (el).dataset?.routerLink;
        const mode = raw === 'replace' ? 'replace' : 'navigate';
        const fn = options[mode] || router[mode];
        fn(rru);
    }

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
}

/**
 * @typedef {import('./types.js').AttachPreloadOptions} AttachPreloadOptions
 * @typedef {import('./types.js').PreloadContext} PreloadContext
 * @typedef {import('./types.js').Node} Node
 * @typedef {import('./types.js').Snapshot} Snapshot
 *
 * @typedef {object} PreloadRouter
 * @property {{ normalize(href: string): string | null }} adapter
 * @property {() => Snapshot} getSnapshot
 */

/**
 * Attach preload-on-hover/focus to `[data-router-link]` elements.
 *
 * When the user hovers or focuses a link, `attachPreload` normalizes the
 * `href` via `router.adapter.normalize`, matches it against the **current**
 * map (`router.getSnapshot().map`), and calls `options.preload(leaf, ctx)`
 * for the resulting leaf node. Intended to warm a user-owned cache — the
 * same cache `afterEnter` reads from.
 *
 * `ctx.signal` is an `AbortSignal` that aborts when `detach()` is called.
 * Pass it through to any cancellable work (fetch, custom loaders). The
 * default `preload` forwards it to `leaf.preload(ctx)`; `leaf.load()` is
 * called without a signal (`import()` does not accept one).
 *
 * Dedupe: each `<a>` element fires `preload` at most once (`WeakSet`). SPA
 * re-renders create fresh `<a>` nodes, so a link that survives a view
 * change preloads again — the user cache is the second line of defense.
 *
 * Errors from `preload` are swallowed: preload is opportunistic. If it
 * fails, `afterEnter` will retry with proper error handling.
 *
 * SSR-safe: outside the browser returns a no-op.
 *
 * @param {PreloadRouter} router
 * @param {AttachPreloadOptions} [options]
 * @returns {() => void}
 */
export function attachPreload(router, options = {}) {
    if (typeof document === 'undefined' || !document.addEventListener) {
        return () => {};
    }

    const preload = options.preload ?? defaultPreload;
    /** @type {WeakSet<Element>} */
    const seen = new WeakSet();
    const controller = new AbortController();
    const ctx = /** @type {PreloadContext} */ ({ signal: controller.signal });

    /** @param {Event} e */
    async function onIntent(e) {
        const target = /** @type {EventTarget | null} */ (e.target);
        if (!target || typeof (/** @type {any} */ (target).closest) !== 'function') {
            return;
        }
        const el = /** @type {Element | null} */ (/** @type {any} */ (target).closest(SELECTOR));
        if (!el) return;
        if (seen.has(el)) return;
        seen.add(el);

        const href = el.getAttribute('href');
        if (!href) return;

        const rru = router.adapter.normalize(href);
        if (rru === null) return;

        const match = router.getSnapshot().map.match(rru);
        if (match.status !== 'matched') return;

        const chain = match.chain;
        const leaf = chain.length > 0 ? chain[chain.length - 1] : undefined;
        if (!leaf) return;

        try {
            await preload(leaf, ctx);
        } catch {
            // Opportunistic — swallow. afterEnter will retry with proper UX.
        }
    }

    document.addEventListener('pointerenter', onIntent, true);
    document.addEventListener('focusin', onIntent);

    return () => {
        controller.abort();
        document.removeEventListener('pointerenter', onIntent, true);
        document.removeEventListener('focusin', onIntent);
    };
}

/**
 * Default preload: prefer `leaf.preload(ctx)`, fall back to `leaf.load()`.
 * Both are app-owned metadata on `file()` — not part of the public type.
 *
 * `leaf.preload` receives `ctx` (with `signal`); `leaf.load` is called
 * without arguments — `import()` does not accept an `AbortSignal`.
 *
 * @param {Node} leaf
 * @param {PreloadContext} ctx
 * @returns {void | Promise<unknown>}
 */
function defaultPreload(leaf, ctx) {
    const meta = /** @type {any} */ (leaf);
    if (typeof meta.preload === 'function') return meta.preload(ctx);
    if (typeof meta.load === 'function') return meta.load();
    return undefined;
}
