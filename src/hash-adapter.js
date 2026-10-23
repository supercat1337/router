// @ts-check

/**
 * @typedef {import('./types.js').UrlAdapter} UrlAdapter
 */

/**
 * @internal
 * @param {string} base
 * @returns {string}
 */
function validateBase(base) {
    if (typeof base !== 'string' || !base.startsWith('/')) {
        throw new TypeError(
            "adapter.base must be a pathname starting with '/', got " + JSON.stringify(base)
        );
    }
    if (base.includes('?') || base.includes('#')) {
        throw new TypeError("adapter.base must not contain '?' or '#'");
    }
    return base.endsWith('/') ? base : base + '/';
}

/**
 * Create a hash-mode URL adapter (`#/...` in the browser URL).
 *
 * Default `base` is `location.pathname` (no trailing slash normalization);
 * `<base href>` does not participate. An explicit `base` is validated. In
 * SSR without `location`, an explicit `base` is required.
 *
 * `read` returns a valid RRU or `/`. `/` when the hash does not start with
 * `/` (e.g. `#section`) or contains a second `#` (`#/users#section`).
 * `read` in SSR throws `TypeError`.
 *
 * In-page anchors in hash mode are not supported via `href`; use
 * `scrollIntoView` after `afterEnter`.
 *
 * @param {{ base?: string }} [opts]
 * @returns {UrlAdapter}
 */
export function createHashAdapter({ base } = {}) {
    const resolvedBase =
        base !== undefined
            ? validateBase(base)
            : typeof location !== 'undefined'
              ? location.pathname
              : null;
    if (resolvedBase === null) {
        throw new TypeError('createHashAdapter: explicit `base` is required in SSR');
    }

    return {
        base: resolvedBase,

        read() {
            if (typeof location === 'undefined') {
                throw new TypeError(
                    'createHashAdapter.read(): no `location` (SSR). ' +
                        'Pass an explicit adapter or use memory mode.'
                );
            }
            const hash = location.hash.slice(1);
            if (!hash.startsWith('/') || hash.includes('#')) return '/';
            return hash;
        },

        write(url, mode) {
            if (typeof history === 'undefined') return;
            const full = resolvedBase + location.search + '#' + url;
            if (mode === 'push') history.pushState(null, '', full);
            else history.replaceState(null, '', full);
        },

        listen(cb) {
            if (typeof addEventListener === 'undefined') return () => {};
            addEventListener('hashchange', cb);
            return () => removeEventListener('hashchange', cb);
        },

        normalize(href) {
            const abs = new URL(href, location.href);
            if (abs.origin !== location.origin) return null;
            if (abs.pathname !== location.pathname) return null;
            if (abs.search !== location.search) return null;
            const rru = abs.hash.slice(1);
            if (!rru.startsWith('/')) return null;
            if (rru.includes('#')) return null;
            return rru;
        },
    };
}
