// @ts-check

/**
 * Minimal in-memory `UrlAdapter` for tests.
 *
 * `current` is the "browser URL" in RRU form (no BU indirection).
 * `write` updates it and appends to `writeCalls`, so tests can assert on
 * `mode` (`push` vs `replace`) — used by guard-layer popstate tests.
 *
 * `href(rru)` returns the RRU as-is — memory mode has no BU. `historyState`
 * returns `null`; `replaceState` is a no-op. Add state tracking if a test
 * needs it.
 *
 * @param {string} [initial]
 */
export function createMemoryAdapter(initial = '/') {
    let current = initial;
    /** @type {Array<{ url: string, mode: 'push' | 'replace' }>} */
    const writeCalls = [];
    /** @type {Array<(e: any) => void>} */
    const listeners = [];

    return {
        base: '/',
        writeCalls,

        read() {
            return current;
        },

        /**
         * @param {string} url
         * @param {'push' | 'replace'} [mode]
         */
        write(url, mode = 'push') {
            current = url;
            writeCalls.push({ url, mode });
        },

        /** @param {(e: any) => void} cb */
        listen(cb) {
            listeners.push(cb);
            return () => {
                const i = listeners.indexOf(cb);
                if (i >= 0) listeners.splice(i, 1);
            };
        },

        /** @param {string} href */
        normalize(href) {
            return href.startsWith('/') ? href : null;
        },

        /**
         * @param {string} rru
         * @param {{ search?: string }} [_opts]
         * @returns {string}
         */
        href(rru, _opts = {}) {
            if (typeof rru !== 'string' || !rru.startsWith('/')) {
                throw new TypeError("adapter.href: expected RRU starting with '/'");
            }
            return rru;
        },

        /** @returns {unknown} */
        historyState() {
            return null;
        },

        /** @param {unknown} _state */
        replaceState(_state) {
            // no-op — memory adapter does not track history state
        },

        trigger() {
            for (const l of listeners.slice()) l({});
        },

        /** @param {string} url */
        setCurrent(url) {
            current = url;
        },
    };
}
