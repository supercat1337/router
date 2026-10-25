// @ts-check

import { ROUTER_BRAND } from './internal/symbols.js';
import { createEventBus } from './events.js';
import { runTransaction } from './transaction.js';
import { isMap } from './map.js';
import { isValidRRU, normalizeRRU } from './normalize.js';

/**
 * @typedef {import('./types.js').Snapshot} Snapshot
 * @typedef {import('./types.js').RouterMap} RouterMap
 * @typedef {import('./types.js').UrlAdapter} UrlAdapter
 * @typedef {import('./types.js').EventPayloads} EventPayloads
 * @typedef {import('./types.js').MatchResult} MatchResult
 */

/**
 * Create a router instance and run the initial transaction.
 *
 * Throws from `createRouter` itself when the initial URL hits a classified
 * diagnostic (`invalid-rru`, `resolver-*`, `notFound-*`, `redirect-loop`,
 * `getState` / `adapter.write` throw) — bootstrap cannot continue without a
 * valid map. After construction, `navigate` / `replace` / `revalidate` never
 * throw on navigation outcomes; they return a `Snapshot` (`status: 'error'`
 * for prod diagnostics).
 *
 * Wiring order with the optional guard layer:
 *   1. `const guard = createGuardLayer({...})`
 *   2. `const router = createRouter({ adapter: guard.wrapAdapter(base), ... })`
 *   3. `guard.bind(router)`
 *   4. `const nav = guard.navigate()`
 *
 * @public
 * @template S
 * @template {RouterMap} R
 * @param {import('./types.js').CreateRouterOptions<S, R>} options
 * @returns {import('./types.js').Router<S, R>}
 */
export function createRouter(options) {
    const HISTORY_LIMIT = 50;

    // Do NOT collapse into destructuring:
    //   const { resolveMap, getState, ... } = options;
    // api-extractor fails with "Unable to determine semantic
    // information for declaration" when this function's local
    // variables come from destructuring with defaults. The
    // --local TypeScript-compiler pass traces type inference
    // differently for `x = options.x ?? d` vs `{ x = d } = options`,
    // and one of those paths trips an internal api-extractor bug.
    // Verified: explicit property access + `??` defaults → build OK.
    const resolveMap = options.resolveMap;
    const getState = options.getState;
    const adapter = options.adapter;
    const maxRedirects = options.maxRedirects ?? 10;
    const onListenerError = options.onListenerError;
    const dev = options.dev;

    if (typeof resolveMap !== 'function') {
        throw new TypeError('createRouter: resolveMap must be a function');
    }
    if (typeof getState !== 'function') {
        throw new TypeError('createRouter: getState must be a function');
    }
    if (!adapter || typeof adapter.read !== 'function') {
        throw new TypeError('createRouter: adapter is required');
    }
    if (typeof maxRedirects !== 'number' || maxRedirects < 0) {
        throw new TypeError('createRouter: maxRedirects must be a non-negative number');
    }

    /** @type {any} */
    const runtimeGlobal = globalThis;
    const isDev =
        dev !== undefined ? !!dev : !(runtimeGlobal.process?.env?.NODE_ENV === 'production');

    const eventBus = createEventBus(onListenerError);

    let counter = 0;
    /** @type {Snapshot | null} */
    let currentSnapshot = null;
    /** @type {string[] | undefined} */
    let lastRedirectPath;
    /** @type {Snapshot[]} */
    const historySnapshots = [];
    let inTransaction = false;

    /** @type {import("./transaction.js").TransactionEnv} */
    const env = {
        getState,
        resolveMap,
        getSnapshot: () => currentSnapshot,
        commitSnapshot: snap => {
            currentSnapshot = snap;
            historySnapshots.push(snap);
            if (historySnapshots.length > HISTORY_LIMIT) {
                historySnapshots.shift();
            }
        },
        adapter,
        maxRedirects,
        dev: isDev,
        nextNavigationId: () => ++counter,
        emit: (event, payload) => eventBus.emit(event, payload),
        setLastRedirectPath: path => {
            lastRedirectPath = path.length > 0 ? path : undefined;
        },
    };

    /**
     * @template T
     * @param {() => T} fn
     * @returns {T}
     */
    function wrap(fn) {
        if (inTransaction) {
            if (isDev) {
                throw new TypeError('reentrancy: navigate/replace/revalidate inside transaction');
            }
            return /** @type {any} */ (currentSnapshot);
        }
        inTransaction = true;
        try {
            return fn();
        } finally {
            inTransaction = false;
        }
    }

    /** @param {string} url */
    function navigate(url) {
        return wrap(() => runTransaction('navigate', url, env));
    }

    /** @param {string} url */
    function replace(url) {
        return wrap(() => runTransaction('replace', url, env));
    }

    function revalidate() {
        return wrap(() => runTransaction('revalidate', adapter.read(), env));
    }

    // Initial transaction — createRouter throws on classified diagnostics.
    inTransaction = true;
    try {
        currentSnapshot = runTransaction('initial', adapter.read(), env);
    } finally {
        inTransaction = false;
    }

    // popstate — synchronous, mirrors initial/navigate.
    adapter.listen(() => {
        if (inTransaction) return;
        inTransaction = true;
        try {
            currentSnapshot = runTransaction('popstate', adapter.read(), env);
        } finally {
            inTransaction = false;
        }
    });

    /**
     * @param {string} name
     * @param {...any} args
     * @returns {string}
     */
    function url(name, ...args) {
        /* c8 ignore next 3 -- unreachable: createRouter commits initial before returning */
        if (!currentSnapshot) {
            throw new TypeError('url(): no committed snapshot');
        }
        // ParamsArgs<P> is a single-element tuple at runtime; spread is fine.
        return currentSnapshot.map.url(
            name,
            .../** @type {[params?: Record<string, string>]} */ (args)
        );
    }

    /**
     * @param {string} name
     * @returns {any}
     */
    function route(name) {
        /* c8 ignore next 3 -- unreachable: createRouter commits initial before returning */
        if (!currentSnapshot) {
            throw new TypeError('route(): no committed snapshot');
        }
        return /** @type {any} */ (currentSnapshot.map.route(name));
    }

    /**
     * @param {number} id
     */
    function isCurrent(id) {
        return currentSnapshot !== null && currentSnapshot.navigationId === id;
    }

    // ---- dev-only (always present at runtime; stripped from public .d.ts) ----

    /**
     * Last N committed snapshots. N is implementation-defined.
     * @internal
     * @returns {Snapshot[]}
     */
    function getHistory() {
        return historySnapshots.slice();
    }

    /**
     * "Where does this lead" without side effects. Normalizes `urlStr`
     * inside. Throws on invalid RRU and on any `resolver-*` violation.
     *
     * @internal
     * @param {string} urlStr
     * @param {{ state?: any, map?: RouterMap }} [opts]
     * @returns {MatchResult}
     */
    function dryMatch(urlStr, opts = {}) {
        if (!isValidRRU(urlStr)) {
            throw new TypeError(`invalid-rru: ${String(urlStr)}`);
        }
        const normalized = normalizeRRU(urlStr);
        /** @type {RouterMap} */
        let map;
        if (opts.map) {
            map = opts.map;
        } else {
            const state = opts.state !== undefined ? opts.state : getState();
            const resolved = resolveMap({ state, url: normalized });
            if (resolved instanceof Promise) {
                throw new TypeError('resolver-promise');
            }
            if (resolved == null) {
                throw new TypeError('resolver-null');
            }
            if (!isMap(resolved)) {
                throw new TypeError('resolver-invalid');
            }
            map = resolved;
        }
        return map.match(normalized);
    }

    /**
     * The map of the most recently committed snapshot. Always a `RouterMap`;
     * unreachable at runtime because `createRouter` throws on a failed
     * initial transaction.
     *
     * @internal
     * @returns {RouterMap}
     */
    function getActiveMap() {
        /* c8 ignore next 3 -- unreachable: createRouter commits initial before returning */
        if (!currentSnapshot) {
            throw new TypeError('getActiveMap(): no committed snapshot');
        }
        return currentSnapshot.map;
    }

    /**
     * Resolve a map for the current state and the given RRU. Throws on
     * invalid RRU and on any `resolver-*` violation.
     *
     * @internal
     * @param {string} urlStr
     * @returns {RouterMap}
     */
    function resolveMapFor(urlStr) {
        if (!isValidRRU(urlStr)) {
            throw new TypeError(`invalid-rru: ${String(urlStr)}`);
        }
        const normalized = normalizeRRU(urlStr);
        const resolved = resolveMap({ state: getState(), url: normalized });
        if (resolved instanceof Promise) throw new TypeError('resolver-promise');
        if (resolved == null) throw new TypeError('resolver-null');
        if (!isMap(resolved)) throw new TypeError('resolver-invalid');
        return resolved;
    }

    /**
     * `redirectPath` of the last transaction (normalized RRUs), or undefined.
     * @internal
     * @returns {string[] | undefined}
     */
    function getRedirectPath() {
        return lastRedirectPath;
    }

    /** @param {(snapshot: Snapshot) => void} listener */
    function subscribe(listener) {
        return eventBus.on('commit', ({ snapshot }) => listener(snapshot));
    }

    const router = {
        adapter,
        navigate,
        replace,
        revalidate,
        back() {
            if (typeof history !== 'undefined') history.back();
        },
        forward() {
            if (typeof history !== 'undefined') history.forward();
        },
        url,
        route,
        getSnapshot() {
            return /** @type {Snapshot} */ (currentSnapshot);
        },
        getState,
        isCurrent,
        subscribe,
        on: eventBus.on,
        off: eventBus.off,
        once: eventBus.once,
        getHistory,
        dryMatch,
        getActiveMap,
        resolveMapFor,
        getRedirectPath,
    };

    Object.defineProperty(router, ROUTER_BRAND, { value: true });
    Object.defineProperty(router, Symbol.toStringTag, { value: 'Router' });

    // Freeze: the router is committed for the page lifetime. `navigate`
    // and friends must not be replaceable — official override points are
    // `attachLinks(router, { navigate })`, `guard.navigate()`, and
    // `subscribe`. `adapter` is intentionally NOT frozen (test doubles
    // like `createMemoryAdapter` mutate themselves).
    Object.freeze(router);

    // Dev-only: hand the frozen router to a devtools hook, if installed.
    // The hook receives an already-frozen instance — it must not try to
    // mutate it; use a WeakMap or its own state instead.
    if (isDev) {
        const hook = /** @type {any} */ (globalThis).__SUPERCAT_ROUTER_DEVTOOLS__;
        if (hook && typeof hook.register === 'function') {
            try {
                hook.register(router);
            } catch {
                // Silent: devtools hooks must not interfere with navigation.
            }
        }
    }

    return router;
}

/**
 * Brand check for a `Router`. The only supported way to detect one at
 * runtime — `instanceof` will not work, and structural lookalikes return
 * `false`. The brand is a private `Symbol` set by `createRouter`.
 *
 * @public
 * @param {unknown} x
 * @returns {x is import('./types.js').Router}
 */
export function isRouter(x) {
    return x !== null && typeof x === 'object' && /** @type {any} */ (x)[ROUTER_BRAND] === true;
}
