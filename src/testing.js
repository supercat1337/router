// @ts-check

import { createRouter } from './router.js';

/**
 * @typedef {object} MemoryAdapterWriteCall
 * @property {string} url
 * @property {'push' | 'replace'} mode
 */

/**
 * In-memory `UrlAdapter` for tests.
 *
 * @typedef {import('./types.js').UrlAdapter & {
 *   readonly writeCalls: ReadonlyArray<MemoryAdapterWriteCall>,
 *   trigger: () => void,
 *   setCurrent: (url: string) => void,
 *   reset: () => void,
 * }} MemoryAdapter
 */

/**
 * Create an in-memory `UrlAdapter` for tests.
 *
 * - `write()` records every call in `writeCalls` (with mode).
 * - `trigger()` fires all listeners — simulate popstate / hashchange.
 * - `setCurrent()` changes `read()` output WITHOUT recording a write.
 * - `historyState()` / `replaceState()` track state locally.
 * - `reset()` clears `writeCalls` and history state (current URL preserved).
 *
 * @param {string} [initial] - initial RRU. Default `'/'`.
 * @returns {MemoryAdapter}
 */
export function createMemoryAdapter(initial = '/') {
    let current = initial;
    /** @type {MemoryAdapterWriteCall[]} */
    const writeCalls = [];
    /** @type {Array<(e: any) => void>} */
    const listeners = [];
    /** @type {unknown} */
    let state = null;

    return {
        base: '/',
        writeCalls,

        read() {
            return current;
        },

        write(url, mode = 'push') {
            current = url;
            writeCalls.push({ url, mode });
        },

        listen(cb) {
            listeners.push(cb);
            return () => {
                const i = listeners.indexOf(cb);
                if (i >= 0) {listeners.splice(i, 1);}
            };
        },

        normalize(href) {
            return href.startsWith('/') ? href : null;
        },

        href(rru, _opts = {}) {
            if (typeof rru !== 'string' || !rru.startsWith('/')) {
                throw new TypeError("adapter.href: expected RRU starting with '/'");
            }
            return rru;
        },

        historyState() {
            return state;
        },

        replaceState(s) {
            state = s;
        },

        trigger() {
            for (const l of listeners.slice()) {l({});}
        },

        /** @param {string} url */
        setCurrent(url) {
            current = url;
        },

        reset() {
            writeCalls.length = 0;
            state = null;
        },
    };
}

/**
 * Create a router with an in-memory adapter, for tests.
 *
 * Shorthand for `createRouter` + `createMemoryAdapter`. Returns the router
 * and the adapter separately — the router is exactly `Router<S, R>` (same
 * type `createRouter` returns); the adapter is `MemoryAdapter` — the core
 * `UrlAdapter` plus test-only methods.
 *
 * `map` and `resolveMap` are mutually exclusive. `state` and `getState` are
 * mutually exclusive. At least one of `map` / `resolveMap` is required.
 *
 * @template S
 * @template {import('./types.js').RouterMap} R
 * @param {{
 *   map?: R,
 *   resolveMap?: (ctx: import('./types.js').ResolveMapContext<S>) => R,
 *   state?: S,
 *   getState?: () => S,
 *   initial?: string,
 *   dev?: boolean,
 * }} options
 * @returns {{ router: import('./types.js').Router<S, R>, adapter: MemoryAdapter }}
 */
export function createTestRouter(options) {
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
        throw new TypeError('createTestRouter: options must be a plain object');
    }

    const hasMap = options.map !== undefined;
    const hasResolveMap = options.resolveMap !== undefined;
    if (hasMap && hasResolveMap) {
        throw new TypeError('createTestRouter: pass map or resolveMap, not both');
    }
    if (!hasMap && !hasResolveMap) {
        throw new TypeError('createTestRouter: map or resolveMap is required');
    }

    const hasState = options.state !== undefined;
    const hasGetState = options.getState !== undefined;
    if (hasState && hasGetState) {
        throw new TypeError('createTestRouter: pass state or getState, not both');
    }

    const map = options.map;
    const userResolveMap = options.resolveMap;
    /** @type {(ctx: import('./types.js').ResolveMapContext<S>) => R} */
    const resolveMap = userResolveMap ?? (() => /** @type {R} */ (map));

    const state = options.state;
    const userGetState = options.getState;
    /** @type {() => S} */
    const getState = userGetState ?? (() => /** @type {S} */ (state));

    const adapter = createMemoryAdapter(options.initial ?? '/');
    const router = createRouter({
        resolveMap,
        getState,
        adapter,
        dev: options.dev ?? true,
    });

    return { router, adapter };
}
