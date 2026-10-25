// @ts-check

/**
 * @typedef {import('./types.js').AttachActiveLinksOptions} AttachActiveLinksOptions
 * @typedef {import('./types.js').Snapshot} Snapshot
 * @typedef {import('./types.js').UrlAdapter} UrlAdapter
 */

const SELECTOR = '[data-router-link]';

/**
 * @typedef {object} ActiveLinksRouter
 * @property {UrlAdapter} adapter
 * @property {() => Snapshot} getSnapshot
 * @property {(listener: (snapshot: Snapshot) => void) => () => void} subscribe
 */

/**
 * Attach `aria-current`-marking to `[data-router-link]` elements.
 *
 * On every committed snapshot (via `router.subscribe`), scans the DOM,
 * matches each link's `href` against `snapshot.url`, and sets
 * `aria-current="page"` (customizable via `options.ariaCurrent`) on the
 * matching one. The attribute is removed from non-matching links that
 * previously had it — but only from elements this instance touched, so a
 * user-set `aria-current` on an unrelated element is left alone.
 *
 * Returns `detach()` — unsubscribes and removes the attribute from any
 * element this instance touched. SSR-safe: outside the browser returns a
 * no-op. `ariaCurrent: false` also returns a no-op.
 *
 * Matching is strict RRU equality: `/profile?tab=1` is not active at
 * `/profile`, and `/users/5` is not active at `/users/5/`. The DOM is
 * rescanned on every commit; elements added after the last commit (e.g.
 * by a view render in `afterEnter`) do not receive `aria-current` until
 * the next commit. If you need immediate marking, call `detach()` +
 * `attachActiveLinks(...)` after the render.
 *
 * @param {ActiveLinksRouter} router
 * @param {AttachActiveLinksOptions} [options]
 * @returns {() => void}
 */
export function attachActiveLinks(router, options = {}) {
    if (typeof document === 'undefined' || !document.querySelectorAll) {
        return () => {};
    }

    const ariaCurrent = options.ariaCurrent ?? 'page';
    if (ariaCurrent === false) {
        return () => {};
    }
    const currentValue = ariaCurrent === true ? 'true' : String(ariaCurrent);

    /** @type {WeakSet<Element>} */
    const touched = new WeakSet();

    /** @param {Snapshot} snapshot */
    function apply(snapshot) {
        const targetUrl = snapshot.url;
        const els = document.querySelectorAll(SELECTOR);
        for (let i = 0; i < els.length; i++) {
            const el = els[i];
            const href = el.getAttribute('href');
            const rru = href ? router.adapter.normalize(href) : null;
            const isActive = rru !== null && rru === targetUrl;

            if (isActive) {
                el.setAttribute('aria-current', currentValue);
                touched.add(el);
            } else if (touched.has(el)) {
                el.removeAttribute('aria-current');
                touched.delete(el);
            }
        }
    }

    // Initial pass: if the current URL already matches a link, mark it
    // immediately — no need to wait for the next commit.
    apply(router.getSnapshot());

    const unsubscribe = router.subscribe(apply);

    return () => {
        unsubscribe();
        const els = document.querySelectorAll(SELECTOR);
        for (let i = 0; i < els.length; i++) {
            const el = els[i];
            if (touched.has(el)) {
                el.removeAttribute('aria-current');
            }
        }
    };
}
