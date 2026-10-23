// @ts-check

/**
 * Minimal in-memory `UrlAdapter` for tests.
 *
 * `current` is the "browser URL" in RRU form (no BU indirection).
 * `write` updates it and appends to `writeCalls`, so tests can assert on
 * `mode` (`push` vs `replace`) — used by guard-layer popstate tests.
 *
 * @param {string} [initial]
 */
export function createMemoryAdapter(initial = "/") {
    let current = initial;
    /** @type {Array<{ url: string, mode: 'push' | 'replace' }>} */
    const writeCalls = [];
    /** @type {Array<(e: any) => void>} */
    const listeners = [];

    return {
        base: "/",
        writeCalls,

        read() {
            return current;
        },

        /**
         * @param {string} url
         * @param {'push' | 'replace'} [mode]
         */
        write(url, mode = "push") {
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
            return href.startsWith("/") ? href : null;
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