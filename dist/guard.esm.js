import { EventEmitter } from '@supercat1337/event-emitter';

// @ts-check

/**
 * Single normalization for RRU. Used by the transaction before matching,
 * before history write, and by `RouterMap.match`. Idempotent.
 *
 * Strips **all** trailing slashes except for the root `/`. Does not
 * percent-decode, does not normalize case, does not touch search, does not
 * touch leading slashes or internal `//`. Empty string stays empty — the
 * caller (transaction) rejects it as invalid RRU.
 *
 * @param {string} url
 * @returns {string}
 */
function normalizeRRU(url) {
    const q = url.indexOf('?');
    const pathname = q >= 0 ? url.slice(0, q) : url;
    const search = q >= 0 ? url.slice(q) : '';
    let stripped = pathname;
    while (stripped.length > 1 && stripped.endsWith('/')) {
        stripped = stripped.slice(0, -1);
    }
    return stripped + search;
}

/**
 * Validity check for Router-relative URLs.
 *
 * A valid RRU starts with `/`, contains no `#`, and is not empty. Form
 * beyond that is not constrained here — trailing slashes, empty segments,
 * and percent-encoding are handled downstream (by `normalizeRRU` and
 * `match`).
 *
 * @internal
 * @param {string} url
 * @returns {boolean}
 */
function isValidRRU(url) {
    if (typeof url !== 'string') return false;
    if (url.length === 0) return false;
    if (!url.startsWith('/')) return false;
    if (url.includes('#')) return false;
    return true;
}

// @ts-check


/** @type {unique symbol} */
const MAP_BRAND = Symbol('spa-router.map');

/** @type {unique symbol} */
const REDIRECT_BRAND = Symbol('spa-router.redirect');

/** @type {unique symbol} */
const ROUTER_BRAND = Symbol('spa-router.router');

// @ts-check


/**
 * Brand check for `RedirectResult`. Runtime narrowing, not a structural
 * check: an object shaped like `{ url }` but without the symbol is not a
 * redirect.
 *
 * @param {unknown} x
 * @returns {x is RedirectResult}
 */
function isRedirect(x) {
    return x !== null && typeof x === 'object' && /** @type {any} */ (x)[REDIRECT_BRAND] === true;
}

// @ts-check


/**
 * @typedef {import('./types.js').EventPayloads} EventPayloads
 * @typedef {import('./types.js').Snapshot} Snapshot
 * @typedef {(err: unknown, info: { event: keyof EventPayloads, snapshot: Snapshot }) => void} OnListenerError
 * @typedef {object} EventBus
 * @property {<E extends keyof EventPayloads>(event: E, listener: (payload: EventPayloads[E]) => void) => () => void} on
 * @property {<E extends keyof EventPayloads>(event: E, listener: (payload: EventPayloads[E]) => void) => void} off
 * @property {<E extends keyof EventPayloads>(event: E, listener: (payload: EventPayloads[E]) => void) => () => void} once
 * @property {<E extends keyof EventPayloads>(event: E, payload: EventPayloads[E]) => void} emit
 */

/**
 * Thin adapter over `@supercat1337/event-emitter` that preserves the
 * router's event contract:
 *
 * - `emit(event, payload)` passes `payload` as the single listener argument;
 * - listener errors are reported via `onListenerError(err, { event, snapshot })`,
 *   with `console.error` as fallback;
 * - `on` returns an idempotent unsubscribe; `once` auto-unsubscribes after
 *   the first emit.
 *
 * @param {OnListenerError | undefined} onListenerError
 * @returns {EventBus}
 */
function createEventBus(onListenerError) {
    const emitter = new EventEmitter();

    // Verify against the library's actual `.d.ts`: `(err, event, payload)`
    // vs `(err, { event, payload })` vs `(err, ...args)`. Adapt the adapter
    // below, not the tests.
    emitter.onListenerError(
        /**
         * @param {unknown} err
         * @param {string} event
         * @param {any} payload
         */
        (err, event, payload) => {
            if (onListenerError) {
                onListenerError(err, {
                    event: /** @type {keyof EventPayloads} */ (event),
                    snapshot: /** @type {Snapshot} */ (
                        /** @type {any} */ (payload)?.snapshot
                    ),
                });
            } else if (
                typeof console !== "undefined" &&
                console.error
            ) {
                console.error(err);
            }
        },
    );

    return /** @type {EventBus} */ ({
        on: (event, listener) => emitter.on(event, listener),
        off: (event, listener) => emitter.off(event, listener),
        once: (event, listener) => emitter.once(event, listener),
        emit: (event, payload) => emitter.emit(event, payload),
    });
}

// @ts-check


/**
 * @typedef {import('./types.js').RouterMap} RouterMap
 * @typedef {import('./types.js').MapValidationErrorCode} MapValidationErrorCode
 * @typedef {import('./types.js').NotFoundHandler} NotFoundHandler
 * @typedef {import('./types.js').Node} Node
 * @typedef {import('./types.js').Children} Children
 */

/**
 * Internal symbol: `WeakMap<Node, string>` from each node to its key in
 * parent's `children`. Populated by `createMap`; used by chain comparison
 * to derive `urlPrefix`. Not exported from the public entry.
 * @internal
 */
const kKeysMap = Symbol('router.map.keysMap');

/**
 * Brand check for a `RouterMap`.
 *
 * @param {unknown} x
 * @returns {x is RouterMap}
 */
function isMap(x) {
    return x !== null && typeof x === 'object' && /** @type {any} */ (x)[MAP_BRAND] === true;
}

// @ts-check


/**
 * @typedef {import('./types.js').Snapshot} Snapshot
 * @typedef {import('./types.js').Node} Node
 * @typedef {import('./types.js').RouterMap} RouterMap
 * @typedef {import('./types.js').NavigationErrorType} NavigationErrorType
 */

/**
 * @internal
 * @param {Snapshot} snapshot
 * @returns {Record<string, string>}
 */
function chainParams(snapshot) {
    return snapshot.status === 'matched' ? snapshot.params : snapshot.partialParams;
}

/**
 * @param {string} url
 * @returns {string}
 */
function pathname(url) {
    const q = url.indexOf('?');
    return q >= 0 ? url.slice(0, q) : url;
}

/**
 * @internal
 * @param {readonly Node[]} chain
 * @param {Snapshot} snapshot
 * @param {WeakMap<Node, string>} keysMap
 * @returns {string[]}
 */
function urlPrefixes(chain, snapshot, keysMap) {
    /** @type {string[]} */
    const prefixes = [];
    for (let i = 0; i < chain.length; i++) {
        const node = chain[i];
        const key = keysMap.get(node);
        const parentPrefix = i === 0 ? '' : prefixes[i - 1];
        /** @type {string} */
        let prefix;
        if (key === undefined) {
            prefix = parentPrefix;
        } else if (key === 'index') {
            prefix = parentPrefix;
        } else if (key === '*') {
            prefix = pathname(snapshot.url);
        } else if (key.startsWith(':')) {
            const name = key.slice(1);
            const params = chainParams(snapshot);
            prefix = parentPrefix + '/' + (params[name] ?? '');
        } else {
            prefix = parentPrefix + '/' + key;
        }
        prefixes.push(prefix);
    }
    return prefixes;
}

/**
 * @internal
 * @param {Snapshot} prev
 * @param {Snapshot} next
 * @param {(map: RouterMap) => WeakMap<Node, string>} getKeysMap
 * @returns {number}
 */
function commonChainPrefix(prev, next, getKeysMap) {
    const prevPrefixes = urlPrefixes(prev.chain, prev, getKeysMap(prev.map));
    const nextPrefixes = urlPrefixes(next.chain, next, getKeysMap(next.map));
    const n = Math.min(prevPrefixes.length, nextPrefixes.length);
    for (let i = 0; i < n; i++) {
        if (prevPrefixes[i] !== nextPrefixes[i]) return i;
    }
    return n;
}

/**
 * @internal
 * @param {number} navigationId
 * @param {RouterMap} map
 * @param {'matched' | 'notFound'} status
 * @param {readonly Node[]} chain
 * @param {Record<string, string>} params
 * @param {Record<string, string>} partialParams
 * @param {string} url
 * @param {unknown} [notFoundResult]
 * @returns {Snapshot}
 */
function buildSnapshot(
    navigationId,
    map,
    status,
    chain,
    params,
    partialParams,
    url,
    notFoundResult
) {
    const frozenChain = Object.freeze([...chain]);
    const frozenParams = Object.freeze({ ...params });
    const frozenPartialParams = Object.freeze({ ...partialParams });
    /** @type {any} */
    const snap = {
        navigationId,
        map,
        status,
        chain: frozenChain,
        params: frozenParams,
        partialParams: frozenPartialParams,
        url,
        leaf: frozenChain.length > 0 ? frozenChain[frozenChain.length - 1] : undefined,
    };
    if (status === 'notFound') snap.notFoundResult = notFoundResult;
    return /** @type {Snapshot} */ (Object.freeze(snap));
}

/**
 * @internal
 * @param {number} navigationId
 * @param {Snapshot} prev
 * @param {NavigationErrorType} type
 * @param {{ error?: unknown, attemptedUrl: string, path?: string[], partialChain: Node[], partialParams: Record<string, string> }} extra
 * @param {string} url
 * @returns {Snapshot}
 */
function buildErrorSnapshot(navigationId, prev, type, extra, url) {
    const frozenPartialChain = Object.freeze([...extra.partialChain]);
    const frozenPartialParams = Object.freeze({ ...extra.partialParams });
    const frozenPath = extra.path ? Object.freeze([...extra.path]) : undefined;
    const error = Object.freeze({
        type,
        error: extra.error,
        attemptedUrl: extra.attemptedUrl,
        path: frozenPath,
        partialChain: frozenPartialChain,
        partialParams: frozenPartialParams,
    });
    return /** @type {Snapshot} */ (
        Object.freeze({
            navigationId,
            map: prev.map,
            status: 'error',
            chain: prev.chain, // already frozen
            params: Object.freeze({}),
            partialParams: chainParams(prev), // already frozen (prev.params / prev.partialParams)
            url,
            leaf: prev.leaf,
            error,
        })
    );
}

// @ts-check


/**
 * @typedef {import('./types.js').Snapshot} Snapshot
 * @typedef {import('./types.js').RouterMap} RouterMap
 * @typedef {import('./types.js').NavigationErrorType} NavigationErrorType
 * @typedef {import('./types.js').Node} Node
 * @typedef {import('./types.js').UrlAdapter} UrlAdapter
 * @typedef {import('./types.js').EventPayloads} EventPayloads
 */

/**
 * @typedef {'navigate' | 'replace' | 'popstate' | 'revalidate' | 'initial'} TransactionSource
 */

/**
 * @typedef {object} TransactionEnv
 * @property {() => any} getState
 * @property {(ctx: { state: any, url: string }) => RouterMap} resolveMap
 * @property {() => Snapshot | null} getSnapshot
 * @property {(snap: Snapshot) => void} commitSnapshot
 * @property {UrlAdapter} adapter
 * @property {number} maxRedirects
 * @property {boolean} dev
 * @property {() => number} nextNavigationId
 * @property {(event: keyof EventPayloads, payload: any) => void} emit
 * @property {(path: string[]) => void} setLastRedirectPath
 *
 * @internal
 */

/**
 * @typedef {{ error?: unknown, attemptedUrl: string, path?: string[], partialChain: Node[], partialParams: Record<string, string> }} ErrorExtra
 */

/**
 * Execute one transaction.
 *
 * Sources: `navigate`, `replace`, `popstate`, `revalidate`, `initial`.
 *
 * Classified diagnostics (`invalid-rru`, `resolver-*`, `notFound-*`,
 * `redirect-loop`) — in dev always throw; in prod commit an error snapshot
 * and emit `navigationError`; for `initial` always throw (bootstrap cannot
 * continue without a valid map).
 *
 * Uncategorized errors (`getState` throw, `adapter.write` throw) —
 * propagate; no snapshot, no event, no `navigationId` increment.
 *
 * @param {TransactionSource} source
 * @param {string} inputUrl
 * @param {TransactionEnv} env
 * @returns {Snapshot}
 */
function runTransaction(source, inputUrl, env) {
    const isInitial = source === 'initial';
    const isNoopEligible = source === 'navigate' || source === 'replace';
    const prevSnapshot = env.getSnapshot();

    // Validate input RRU. `popstate` reads through adapter which guarantees
    // validity per adapter contract; other sources pass through the public
    // API and must be checked here.
    if (source !== 'popstate' && !isValidRRU(inputUrl)) {
        return handleError(
            'invalid-rru',
            { attemptedUrl: inputUrl, partialChain: [], partialParams: {} },
            prevSnapshot,
            isInitial,
            env
        );
    }

    let url = normalizeRRU(inputUrl);

    // No-op for navigate/replace (skip when the current snapshot is error).
    if (isNoopEligible && prevSnapshot && prevSnapshot.status !== 'error') {
        const current = normalizeRRU(env.adapter.read());
        if (url === current) return prevSnapshot;
    }

    /** @type {string[]} */
    const redirectPath = [];
    let depth = 0;

    /** @type {RouterMap | null} */
    let map = null;
    /** @type {Node[]} */
    let chain = [];
    /** @type {Record<string, string>} */
    let params = {};
    /** @type {Record<string, string>} */
    let partialParams = {};
    /** @type {'matched' | 'notFound'} */
    let status = 'matched';
    /** @type {unknown} */
    let notFoundResult;

    // LOOP
    for (;;) {
        let state;
        try {
            state = env.getState();
        } catch (e) {
            // Uncategorized: propagate; no snapshot, no event, no ID.
            throw e;
        }

        let resolved;
        try {
            resolved = env.resolveMap({ state, url });
        } catch (e) {
            return handleError(
                'resolver-throw',
                { error: e, attemptedUrl: url, partialChain: [], partialParams: {} },
                prevSnapshot,
                isInitial,
                env
            );
        }
        if (resolved instanceof Promise) {
            return handleError(
                'resolver-promise',
                { attemptedUrl: url, partialChain: [], partialParams: {} },
                prevSnapshot,
                isInitial,
                env
            );
        }
        if (resolved == null) {
            return handleError(
                'resolver-null',
                { attemptedUrl: url, partialChain: [], partialParams: {} },
                prevSnapshot,
                isInitial,
                env
            );
        }
        if (!isMap(resolved)) {
            return handleError(
                'resolver-invalid',
                { attemptedUrl: url, partialChain: [], partialParams: {} },
                prevSnapshot,
                isInitial,
                env
            );
        }
        map = resolved;

        const matchResult = map.match(url);

        if (matchResult.status === 'notFound') {
            let result;
            try {
                result = matchResult.handler({
                    url: matchResult.url,
                    chain: matchResult.chain,
                });
            } catch (e) {
                return handleError(
                    'notFound-throw',
                    {
                        error: e,
                        attemptedUrl: url,
                        partialChain: matchResult.chain,
                        partialParams: matchResult.partialParams,
                    },
                    prevSnapshot,
                    isInitial,
                    env
                );
            }
            if (result instanceof Promise) {
                return handleError(
                    'notFound-promise',
                    {
                        attemptedUrl: url,
                        partialChain: matchResult.chain,
                        partialParams: matchResult.partialParams,
                    },
                    prevSnapshot,
                    isInitial,
                    env
                );
            }
            if (isRedirect(result)) {
                const target = result.url;
                if (!isValidRRU(target)) {
                    return handleError(
                        'invalid-rru',
                        {
                            attemptedUrl: target,
                            partialChain: matchResult.chain,
                            partialParams: matchResult.partialParams,
                        },
                        prevSnapshot,
                        isInitial,
                        env
                    );
                }
                const normalized = normalizeRRU(target);
                if (depth >= env.maxRedirects || redirectPath.includes(normalized)) {
                    return handleError(
                        'redirect-loop',
                        {
                            attemptedUrl: url,
                            path: redirectPath,
                            partialChain: matchResult.chain,
                            partialParams: matchResult.partialParams,
                        },
                        prevSnapshot,
                        isInitial,
                        env
                    );
                }
                url = normalized;
                redirectPath.push(normalized);
                depth++;
                continue;
            }
            status = 'notFound';
            chain = matchResult.chain;
            params = {};
            partialParams = matchResult.partialParams;
            notFoundResult = result;
            break;
        }

        status = 'matched';
        chain = matchResult.chain;
        params = matchResult.params;
        partialParams = {};
        break;
    }

    // History write.
    /** @type {string} */
    let committedUrl;
    if (source === 'navigate') {
        env.adapter.write(url, 'push');
        committedUrl = normalizeRRU(env.adapter.read());
    } else {
        const current = normalizeRRU(env.adapter.read());
        if (url !== current) {
            env.adapter.write(url, 'replace');
            committedUrl = normalizeRRU(env.adapter.read());
        } else {
            committedUrl = current;
        }
    }

    // navigationId.
    const navigationId = env.nextNavigationId();

    // Snapshot commit.
    const snapshot = buildSnapshot(
        navigationId,
        /** @type {RouterMap} */ (map),
        status,
        chain,
        params,
        partialParams,
        committedUrl,
        notFoundResult
    );
    env.commitSnapshot(snapshot);
    env.setLastRedirectPath(redirectPath);

    // Chain comparison + events.
    /** @type {Node[]} */
    let leaveSuffix = [];
    /** @type {Node[]} */
    let enterSuffix = chain;
    /** @type {RouterMap | null} */
    let oldMap = null;
    if (prevSnapshot) {
        oldMap = prevSnapshot.map;
        const P = commonChainPrefix(prevSnapshot, snapshot, getKeysMap);
        leaveSuffix = prevSnapshot.chain.slice(P);
        enterSuffix = chain.slice(P);
    }

    const mapChanged = oldMap !== null && oldMap !== snapshot.map;

    if (mapChanged) {
        env.emit('mapWillChange', {
            oldMap: /** @type {RouterMap} */ (oldMap),
            newMap: snapshot.map,
            snapshot,
        });
    }
    if (leaveSuffix.length > 0) {
        env.emit('beforeLeave', { suffix: leaveSuffix, snapshot });
        env.emit('afterLeave', { suffix: leaveSuffix, snapshot });
    }
    if (mapChanged) {
        env.emit('mapChanged', {
            oldMap: /** @type {RouterMap} */ (oldMap),
            newMap: snapshot.map,
            snapshot,
        });
    }
    if (enterSuffix.length > 0) {
        env.emit('beforeEnter', { suffix: enterSuffix, snapshot });
        env.emit('afterEnter', { suffix: enterSuffix, snapshot });
    }

    env.emit('commit', { snapshot });

    return snapshot;
}

/**
 * @param {RouterMap} map
 * @returns {WeakMap<Node, string>}
 */
function getKeysMap(map) {
    const km = /** @type {any} */ (map)[kKeysMap];
    return km instanceof WeakMap ? km : new WeakMap();
}

/**
 * @param {NavigationErrorType} type
 * @param {ErrorExtra} extra
 * @param {Snapshot | null} prevSnapshot
 * @param {boolean} isInitial
 * @param {TransactionEnv} env
 * @returns {Snapshot}
 */
function handleError(type, extra, prevSnapshot, isInitial, env) {
    if (isInitial) {
        if (extra.error !== undefined) throw extra.error;
        throw new TypeError(`initial transaction failed: ${type}`);
    }
    if (env.dev) {
        if (extra.error !== undefined) throw extra.error;
        throw new TypeError(type);
    }
    /* c8 ignore next 4 */
    if (!prevSnapshot) {
        // Unreachable: non-initial always has a previous snapshot.
        throw new TypeError(`error before first commit: ${type}`);
    }

    const navigationId = env.nextNavigationId();
    const url = normalizeRRU(env.adapter.read());
    const snapshot = buildErrorSnapshot(navigationId, prevSnapshot, type, extra, url);
    env.commitSnapshot(snapshot);
    env.setLastRedirectPath(extra.path ?? []);
    env.emit('navigationError', {
        type,
        error: extra.error,
        attemptedUrl: extra.attemptedUrl,
        path: extra.path,
        snapshot,
    });
    env.emit('commit', { snapshot });
    return snapshot;
}

// @ts-check


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
function createRouter(options) {
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
     * @param {Record<string, string>} [params]
     */
    function url(name, params) {
        /* c8 ignore next 3 -- unreachable: createRouter commits initial before returning */
        if (!currentSnapshot) {
            throw new TypeError('url(): no committed snapshot');
        }
        return currentSnapshot.map.url(name, params);
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

    // Dev-only: hand the router to a devtools hook, if one is installed.
    // This is not a public API — it's a side channel extensions discover
    // by name. The contract: `register(router)` is called synchronously
    // before `createRouter` returns; if it throws, the error is swallowed
    // (devtools must never break the app). Multiple routers → multiple
    // `register` calls; no `unregister` (routers live for the page lifetime).
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

// @ts-check


/**
 * @typedef {import('./types.js').GuardLayer} GuardLayer
 * @typedef {import('./types.js').Guard} Guard
 * @typedef {import('./types.js').GuardErrorType} GuardErrorType
 * @typedef {import('./types.js').Decision} Decision
 * @typedef {import('./types.js').NavResult} NavResult
 * @typedef {import('./types.js').Router} Router
 * @typedef {import('./types.js').UrlAdapter} UrlAdapter
 * @typedef {import('./types.js').Snapshot} Snapshot
 */

/**
 * @typedef {import('./types.js').CreateGuardLayerOptions} CreateGuardLayerOptions
 * @typedef {import('./types.js').OnGuardError} OnGuardError
 */

/**
 * Create an optional async guard layer.
 *
 * The core stays synchronous; guards work over proposals before the router
 * commits. The only integration point into the core is
 * `wrapAdapter(adapter).listen` — for `popstate`, where the browser has
 * already changed the URL and the guards must run before `cb(e)` is fired.
 *
 * Wiring order is mandatory:
 *   1. `const guard = createGuardLayer({...})`
 *   2. `const router = createRouter({ adapter: guard.wrapAdapter(base), ... })`
 *   3. `guard.bind(router)`
 *   4. `const nav = guard.navigate()`
 *   5. `attachLinks(router, { navigate: nav.navigate, replace: nav.replace })`
 *
 * @param {CreateGuardLayerOptions} options
 * @returns {GuardLayer}
 */
function createGuardLayer(options) {
    if (!options || typeof options !== 'object') {
        throw new TypeError('createGuardLayer: options must be an object');
    }

    const guards = options.guards;
    const maxRedirects = options.maxRedirects ?? 10;
    const onError = options.onError;
    const dev = options.dev;

    if (!Array.isArray(guards)) {
        throw new TypeError('createGuardLayer: guards must be an array');
    }
    if (typeof maxRedirects !== 'number' || maxRedirects < 0) {
        throw new TypeError('createGuardLayer: maxRedirects must be a non-negative number');
    }
    if (onError !== undefined && typeof onError !== 'function') {
        throw new TypeError('createGuardLayer: onError must be a function');
    }

    /** @type {any} */
    const runtimeGlobal = globalThis;
    const isDev =
        dev !== undefined ? !!dev : !(runtimeGlobal.process?.env?.NODE_ENV === 'production');

    /** @type {Router | null} */
    let boundRouter = null;
    /** @type {UrlAdapter | null} */
    let wrappedAdapter = null;
    /** @type {AbortController | null} */
    let currentAbort = null;
    /** @type {{ url: string, since: number } | null} */
    let pendingState = null;
    /** Guard is in its synchronous frame — reentrancy window. */
    let syncInGuard = false;

    /**
     * Facade for `ctx.router`. Deliberately lacks `navigate` / `replace` /
     * `revalidate` / `dryMatch`: reentrancy through it is impossible by API.
     * @returns {Pick<Router, "getSnapshot" | "getState" | "isCurrent" | "url">}
     */
    function makeFacade() {
        const r = /** @type {Router} */ (boundRouter);
        return {
            getSnapshot: () => r.getSnapshot(),
            getState: () => r.getState(),
            isCurrent: id => r.isCurrent(id),
            url: (name, params) => r.url(name, params),
        };
    }

    /**
     * @param {unknown} e
     * @returns {boolean}
     */
    function isCancelError(e) {
        if (!(e instanceof Error)) return false;
        return e.name === 'CancelError' || (e.constructor && e.constructor.name === 'CancelError');
    }

    /**
     * Extract redirect target from a decision, supporting both `RedirectResult`
     * (from `redirect()`) and the legacy `{ redirect: string }` shape.
     *
     * @param {import('./types.js').Decision} decision
     * @returns {string | null}
     */
    function getRedirectTarget(decision) {
        if (isRedirect(decision)) return decision.url;
        if (typeof decision === 'object' && decision !== null && 'redirect' in decision) {
            return decision.redirect;
        }
        return null;
    }

    /**
     * Run guards sequentially. Only the synchronous frame of each guard sees
     * `syncInGuard = true`; once the guard awaits, the flag is cleared and
     * concurrent `nav.*` from outside is allowed (last-write-wins).
     *
     * @param {string} url
     * @param {AbortSignal} signal
     * @param {Snapshot} from
     * @returns {Promise<Decision>}
     */
    async function runGuards(url, signal, from) {
        const facade = makeFacade();
        for (const guard of guards) {
            if (signal.aborted) return { block: true };
            /** @type {Decision} */
            let decision;
            syncInGuard = true;
            try {
                const promise = guard({ url, from, signal, router: facade });
                syncInGuard = false;
                decision = await promise;
            } catch (e) {
                syncInGuard = false;
                if (isCancelError(e)) return { block: true };
                onError?.({ type: 'guard-throw', error: e }, { url, from });
                return { block: true };
            }
            if (signal.aborted) return { block: true };
            if (decision !== 'allow') return decision;
        }
        return 'allow';
    }

    /**
     * Walk the guard chain from `startUrl`, following redirects. Aborts any
     * previous in-flight run. Returns the terminal decision.
     *
     * @param {string} startUrl
     * @returns {Promise<
     *   | { decision: 'allow', url: string, hadRedirect: boolean,
     *       redirectPath: string[], aborted: false }
     *   | { decision: 'block', aborted: boolean }
     * >}
     */
    async function runGuardChain(startUrl) {
        if (currentAbort) currentAbort.abort();
        let controller = new AbortController();
        currentAbort = controller;

        const pendingSince = performance.now();
        pendingState = { url: startUrl, since: pendingSince };

        /** @type {string[]} */
        const redirectPath = [];
        let currentUrl = startUrl;
        let hadRedirect = false;

        try {
            for (;;) {
                /* c8 ignore next 3 -- unreachable: no await between `currentAbort = controller` and this check, so an external abort cannot interleave. */
                if (controller.signal.aborted) {
                    return { decision: 'block', aborted: true };
                }
                const from = /** @type {Router} */ (boundRouter).getSnapshot();
                const decision = await runGuards(currentUrl, controller.signal, from);
                if (controller.signal.aborted) {
                    return { decision: 'block', aborted: true };
                }

                if (decision === 'allow') {
                    return {
                        decision: 'allow',
                        url: currentUrl,
                        hadRedirect,
                        redirectPath,
                        aborted: false,
                    };
                }

                if (typeof decision === 'object' && decision !== null && 'block' in decision) {
                    return { decision: 'block', aborted: false };
                }

                const redirectTarget = getRedirectTarget(decision);
                if (redirectTarget !== null) {
                    const target = redirectTarget;
                    if (!isValidRRU(target)) {
                        if (isDev) {
                            throw new TypeError(
                                `guard-layer: invalid redirect target ${JSON.stringify(target)}`
                            );
                        }
                        onError?.({ type: 'invalid-rru', target }, { url: currentUrl, from });
                        return { decision: 'block', aborted: false };
                    }
                    const normalized = normalizeRRU(target);
                    if (redirectPath.length >= maxRedirects || redirectPath.includes(normalized)) {
                        if (isDev) {
                            throw new TypeError(
                                `guard-layer: redirect loop ${redirectPath.join(' → ')}`
                            );
                        }
                        onError?.(
                            { type: 'guard-redirect-loop', path: redirectPath.slice() },
                            { url: currentUrl, from }
                        );
                        return { decision: 'block', aborted: false };
                    }
                    redirectPath.push(normalized);
                    currentUrl = normalized;
                    hadRedirect = true;
                    pendingState = { url: normalized, since: pendingSince };
                    controller.abort();
                    controller = new AbortController();
                    currentAbort = controller;
                    continue;
                }

                return { decision: 'block', aborted: false };
            }
        } finally {
            pendingState = null;
            if (currentAbort === controller) currentAbort = null;
        }
    }

    /**
     * @param {string} url
     * @param {'navigate' | 'replace'} mode
     * @returns {Promise<NavResult>}
     */
    async function runGuarded(url, mode) {
        if (syncInGuard) {
            if (isDev) {
                throw new TypeError('guard-layer: reentrancy — nav.* called from within a guard');
            }
            onError?.(
                { type: 'reentrancy' },
                {
                    url,
                    from: /** @type {Router} */ (boundRouter).getSnapshot(),
                }
            );
            return { status: 'blocked' };
        }

        const result = await runGuardChain(url);
        if (result.aborted) return { status: 'blocked' };
        if (result.decision === 'block') return { status: 'blocked' };

        const finalMode = result.hadRedirect ? 'replace' : mode;
        const router = /** @type {Router} */ (boundRouter);
        const snapshot =
            finalMode === 'replace' ? router.replace(result.url) : router.navigate(result.url);
        return { status: 'committed', snapshot };
    }

    /**
     * @param {string} targetUrl
     * @param {Snapshot} from
     * @param {any} e
     * @param {(e: any) => void} cb
     * @returns {Promise<void>}
     */
    async function handlePopstateAsync(targetUrl, from, e, cb) {
        const result = await runGuardChain(targetUrl);
        if (result.aborted) return;

        const router = /** @type {Router} */ (boundRouter);
        const wrapped = /** @type {UrlAdapter} */ (wrappedAdapter);

        if (result.decision === 'allow') {
            if (!result.hadRedirect) {
                cb(e);
            } else {
                router.replace(result.url);
            }
            return;
        }

        wrapped.write(from.url, 'replace');
    }

    /**
     * @param {UrlAdapter} adapter
     * @returns {UrlAdapter}
     */
    function wrapAdapter(adapter) {
        wrappedAdapter = {
            base: adapter.base,
            read: () => adapter.read(),
            write: (url, mode) => adapter.write(url, mode),
            normalize: href => adapter.normalize(href),
            listen(cb) {
                return adapter.listen(e => {
                    if (!boundRouter) {
                        cb(e);
                        return;
                    }
                    const from = boundRouter.getSnapshot();
                    const targetUrl = adapter.read();
                    handlePopstateAsync(targetUrl, from, e, cb).catch(err => {
                        onError?.({ type: 'guard-throw', error: err }, { url: targetUrl, from });
                        adapter.write(from.url, 'replace');
                    });
                });
            },
        };
        return wrappedAdapter;
    }

    /**
     * @param {Router} router
     */
    function bind(router) {
        boundRouter = router;
    }

    /**
     * @returns {{
     *   navigate: (url: string) => Promise<NavResult>,
     *   replace: (url: string) => Promise<NavResult>,
     * }}
     */
    function navigate() {
        if (!boundRouter) {
            throw new TypeError('guard.navigate(): bind not called');
        }
        return {
            navigate: url => runGuarded(url, 'navigate'),
            replace: url => runGuarded(url, 'replace'),
        };
    }

    /**
     * Current in-flight guard state; `null` when idle. `signal` is the
     * `AbortSignal` of the in-flight run — aborts when a newer navigation
     * starts, or a redirect-iteration begins.
     */
    function pending() {
        if (!pendingState || !currentAbort) return null;
        return {
            url: pendingState.url,
            since: pendingState.since,
            signal: currentAbort.signal,
        };
    }

    return {
        wrapAdapter,
        bind,
        navigate,
        pending,
    };
}

/**
 * Create a router with an already-wired guard layer. Replaces the mandatory
 * 5-step wiring (`createGuardLayer` → `wrapAdapter` → `createRouter` →
 * `bind` → `navigate()`) with a single call.
 *
 * @template S
 * @template {import('./types.js').RouterMap} R
 * @param {import('./types.js').CreateGuardedRouterOptions<S, R>} options
 * @returns {import('./types.js').GuardedRouter<S, R>}
 */
function createGuardedRouter(options) {
    if (!options || typeof options !== 'object') {
        throw new TypeError('createGuardedRouter: options must be an object');
    }
    if (!options.adapter) {
        throw new TypeError('createGuardedRouter: options.adapter is required');
    }

    const guard = createGuardLayer({
        guards: options.guards,
        maxRedirects: options.guardMaxRedirects,
        onError: options.onGuardError,
        dev: options.dev,
    });
    const wrappedAdapter = guard.wrapAdapter(options.adapter);
    const router = createRouter({
        resolveMap: options.resolveMap,
        getState: options.getState,
        adapter: wrappedAdapter,
        maxRedirects: options.maxRedirects,
        onListenerError: options.onListenerError,
        dev: options.dev,
    });
    guard.bind(router);
    const nav = guard.navigate();
    return { router, guard, nav };
}

export { createGuardLayer, createGuardedRouter };
