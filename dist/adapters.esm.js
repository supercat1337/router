// @ts-check

/**
 * @typedef {import('./types.js').UrlAdapter} UrlAdapter
 */

/**
 * Validate a base pathname: must be a string, start with `/`, contain no
 * query or hash. Trailing slash is normalized to exactly one.
 *
 * @internal
 * @param {string} base
 * @returns {string}
 */
function validateBase$1(base) {
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
 * Resolve base for path mode. Priority:
 * 1. explicit `base` from options (validated);
 * 2. `<base href>` from the document, if it yields a valid pathname with
 *    a trailing slash;
 * 3. otherwise — `TypeError`. Auto-deriving from `location.pathname` is
 *    forbidden: it gives the wrong base on deep links.
 *
 * A `<base href>` without a trailing slash is an error, not a hint to
 * "fix" — the HTML already means "directory containing the last segment".
 *
 * @internal
 * @param {string | undefined} explicitBase
 * @returns {string}
 */
function resolveBase(explicitBase) {
    if (explicitBase !== undefined) return validateBase$1(explicitBase);

    if (typeof document !== 'undefined') {
        const baseEl = /** @type {HTMLBaseElement | null} */ (document.querySelector('base[href]'));
        const href = baseEl ? baseEl.href : undefined;
        if (href) {
            const path = new URL(href).pathname;
            if (path.endsWith('/')) return validateBase$1(path);
            throw new TypeError(
                "createPathAdapter: <base href> must end with '/' (base = " +
                    JSON.stringify(path) +
                    ')'
            );
        }
    }

    throw new TypeError(
        'createPathAdapter: explicit `base` or `<base href>` is required. ' +
            'Auto-computing base from location.pathname is not supported — ' +
            'it gives wrong results on deep links.'
    );
}

/**
 * Create a path-mode URL adapter (history API, `base` as pathname prefix).
 *
 * `read`/`write` are the only functions that touch `location`/`history`.
 * `read` returns a valid RRU: fallback `'/'` if `location.pathname` is not
 * under `base`, or if the computed RRU would contain `#` (defensive).
 *
 * SSR: `read` returns `'/'`, `write`/`listen` are no-ops. `normalize` is
 * not called in SSR (`attachLinks` is a no-op there); behavior undefined.
 *
 * @param {{ base?: string }} [opts]
 * @returns {UrlAdapter}
 */
function createPathAdapter({ base } = {}) {
    const resolvedBase = resolveBase(base);

    return {
        base: resolvedBase,

        read() {
            // 08#ssr and 08#invariants п. 11 require the SSR fallback.
            // The reference code in 08#path-mode omits this check —
            // reconciled in favour of the invariants.
            if (typeof location === 'undefined') return '/';
            const path = location.pathname;
            if (!path.startsWith(resolvedBase)) return '/';
            const rru = '/' + path.slice(resolvedBase.length) + location.search;
            return rru.includes('#') ? '/' : rru;
        },

        write(url, mode) {
            if (typeof history === 'undefined') return;
            const full = resolvedBase + url.slice(1);
            if (mode === 'push') history.pushState(null, '', full);
            else history.replaceState(null, '', full);
        },

        listen(cb) {
            if (typeof addEventListener === 'undefined') return () => {};
            addEventListener('popstate', cb);
            return () => removeEventListener('popstate', cb);
        },

        normalize(href) {
            const abs = new URL(href, location.href);
            if (abs.origin !== location.origin) return null;
            if (abs.protocol !== 'http:' && abs.protocol !== 'https:') {
                return null;
            }
            if (!abs.pathname.startsWith(resolvedBase)) return null;
            const sameDoc = abs.pathname === location.pathname && abs.search === location.search;
            if (sameDoc && abs.hash !== '') return null;
            const rest = abs.pathname.slice(resolvedBase.length);
            return '/' + rest + abs.search;
        },
    };
}

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
function createHashAdapter({ base } = {}) {
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

export { createHashAdapter, createPathAdapter };
