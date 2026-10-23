// @ts-check

/**
 * @typedef {import('./types.js').Router} Router
 * @typedef {import('./types.js').AttachLinksOptions} AttachLinksOptions
 */

const SELECTOR = "[data-router-link]";

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
function attachLinks(router, options = {}) {
    if (typeof document === "undefined" || !document.addEventListener) {
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
        if (
            !target ||
            typeof (/** @type {any} */ (target)).closest !== "function"
        ) {
            return;
        }

        const el = /** @type {Element | null} */ (
            /** @type {any} */ (target).closest(SELECTOR)
        );
        if (!el) return;

        const tgt = el.getAttribute("target");
        if (tgt && tgt !== "_self") return;
        if (el.hasAttribute("download")) return;

        const href = el.getAttribute("href");
        if (!href) return;

        const rru = router.adapter.normalize(href);
        if (rru === null) return;

        e.preventDefault();

        const raw = /** @type {any} */ (el).dataset?.routerLink;
        const mode = raw === "replace" ? "replace" : "navigate";
        const fn = options[mode] || router[mode];
        fn(rru);
    }

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
}

export { attachLinks };
