import { EventEmitter } from '@supercat1337/event-emitter';

// @ts-check


/** @type {unique symbol} */
const MAP_BRAND = Symbol('spa-router.map');

/** @type {unique symbol} */
const REDIRECT_BRAND = Symbol('spa-router.redirect');

/** @type {unique symbol} */
const ROUTER_BRAND = Symbol('spa-router.router');

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
    if (typeof url !== 'string') {return false;}
    if (url.length === 0) {return false;}
    if (!url.startsWith('/')) {return false;}
    if (url.includes('#')) {return false;}
    return true;
}

// @ts-check


/**
 * @typedef {import('./types.js').RouterMap} RouterMap
 * @typedef {import('./types.js').MapValidationErrorCode} MapValidationErrorCode
 * @typedef {import('./types.js').NotFoundHandler} NotFoundHandler
 * @typedef {import('./types.js').Node} Node
 * @typedef {import('./types.js').Children} Children
 * @typedef {import('./types.js').Route} Route
 * @typedef {import('./matching.js').FolderIndex} FolderIndex
 * @typedef {import('./matching.js').UrlTemplate} UrlTemplate
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
 * @typedef {import('./types.js').Snapshot} Snapshot
 * @typedef {import('./types.js').Node} Node
 * @typedef {import('./types.js').RouterMap} RouterMap
 * @typedef {import('./types.js').NavigationErrorType} NavigationErrorType
 * @typedef {import('./types.js').NavigationType} NavigationType
 */

/**
 * `:name` params of `snapshot.chain`. Convenience for generic code that
 * works on both matched and notFound snapshots — returns `params` when
 * `status === 'matched'`, `partialParams` otherwise (including `error`).
 *
 * Always returns a frozen object. For `error` snapshots, returns the
 * params of the previous committed snapshot — consistent with
 * `snapshot.chain` / `snapshot.map` / `snapshot.leaf`.
 *
 * @public
 * @param {Snapshot} snapshot
 * @returns {Readonly<Record<string, string>>}
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
            // Encode :name values canonically — matches `map.url()` output.
            // Handles IDs containing '/', '?', '#'. Non-canonical input URLs
            // (e.g. `/users/%35` vs `/users/5`) are accepted at the router
            // level, but prefix matching then relies on the caller's encoding.
            prefix = parentPrefix + '/' + encodeURIComponent(params[name] ?? '');
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
        if (prevPrefixes[i] !== nextPrefixes[i]) {return i;}
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
 * @param {Record<string, string>} search
 * @param {NavigationType} navigationType
 * @param {unknown} [notFoundResult]
 * @param {string} [redirectedFrom] - original URL before the first redirect
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
    search,
    navigationType,
    notFoundResult,
    redirectedFrom
) {
    const frozenChain = Object.freeze([...chain]);
    const frozenParams = Object.freeze({ ...params });
    const frozenPartialParams = Object.freeze({ ...partialParams });
    const frozenSearch = Object.freeze({ ...search });
    /** @type {any} */
    const snap = {
        navigationId,
        navigationType,
        map,
        status,
        chain: frozenChain,
        params: frozenParams,
        partialParams: frozenPartialParams,
        search: frozenSearch,
        url,
        leaf: frozenChain.length > 0 ? frozenChain[frozenChain.length - 1] : undefined,
    };
    if (status === 'notFound') {snap.notFoundResult = notFoundResult;}
    if (redirectedFrom !== undefined) {snap.redirectedFrom = redirectedFrom;}
    return /** @type {Snapshot} */ (Object.freeze(snap));
}

/**
 * @internal
 * @param {number} navigationId
 * @param {Snapshot} prev
 * @param {NavigationErrorType} type
 * @param {{ error?: unknown, attemptedUrl: string, path?: string[], partialChain: Node[], partialParams: Record<string, string> }} extra
 * @param {string} url
 * @param {NavigationType} navigationType
 * @returns {Snapshot}
 */
function buildErrorSnapshot(navigationId, prev, type, extra, url, navigationType) {
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
            navigationType,
            map: prev.map,
            status: 'error',
            chain: prev.chain,
            params: Object.freeze({}),
            partialParams: chainParams(prev),
            search: prev.search ?? Object.freeze({}),
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
 * @typedef {import('./types.js').NavigationType} NavigationType
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

    /**
     * Public `navigationType` of the committed snapshot. Derived once from
     * `source` and used for both success and error commits, so a
     * `resolver-throw` during a popstate produces `navigationType: 'pop'`,
     * not `'push'`.
     *
     * @type {NavigationType}
     */
    const navigationType =
        source === 'navigate'
            ? 'push'
            : source === 'replace'
              ? 'replace'
              : source === 'popstate'
                ? 'pop'
                : source; // 'revalidate' | 'initial'

    // Validate input RRU. `popstate` reads through adapter which guarantees
    // validity per adapter contract; other sources pass through the public
    // API and must be checked here.
    if (source !== 'popstate' && !isValidRRU(inputUrl)) {
        return handleError(
            'invalid-rru',
            { attemptedUrl: inputUrl, partialChain: [], partialParams: {} },
            prevSnapshot,
            isInitial,
            navigationType,
            env
        );
    }

    let url = normalizeRRU(inputUrl);
    // For `redirectedFrom`: the URL as passed in, before any redirect hops.
    const originalUrl = url;

    // No-op for navigate/replace (skip when the current snapshot is error).
    if (isNoopEligible && prevSnapshot && prevSnapshot.status !== 'error') {
        const current = normalizeRRU(env.adapter.read());
        if (url === current) {return prevSnapshot;}
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
    /** @type {Record<string, string>} */
    let search = {};
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
                navigationType,
                env
            );
        }
        if (resolved instanceof Promise) {
            return handleError(
                'resolver-promise',
                { attemptedUrl: url, partialChain: [], partialParams: {} },
                prevSnapshot,
                isInitial,
                navigationType,
                env
            );
        }
        if (resolved == null) {
            return handleError(
                'resolver-null',
                { attemptedUrl: url, partialChain: [], partialParams: {} },
                prevSnapshot,
                isInitial,
                navigationType,
                env
            );
        }
        if (!isMap(resolved)) {
            return handleError(
                'resolver-invalid',
                { attemptedUrl: url, partialChain: [], partialParams: {} },
                prevSnapshot,
                isInitial,
                navigationType,
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
                    search: matchResult.search,
                    partialParams: matchResult.partialParams,
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
                    navigationType,
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
                    navigationType,
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
                        navigationType,
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
                        navigationType,
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
            search = matchResult.search;
            notFoundResult = result;
            break;
        }

        status = 'matched';
        chain = matchResult.chain;
        params = matchResult.params;
        partialParams = {};
        search = matchResult.search;
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
    const redirectedFrom = redirectPath.length > 0 ? originalUrl : undefined;
    const snapshot = buildSnapshot(
        navigationId,
        /** @type {RouterMap} */ (map),
        status,
        chain,
        params,
        partialParams,
        committedUrl,
        search,
        navigationType,
        notFoundResult,
        redirectedFrom
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
 * @param {NavigationType} navigationType
 * @param {TransactionEnv} env
 * @returns {Snapshot}
 */
function handleError(type, extra, prevSnapshot, isInitial, navigationType, env) {
    if (isInitial) {
        if (extra.error !== undefined) {throw extra.error;}
        throw new TypeError(`initial transaction failed: ${type}`);
    }
    if (env.dev) {
        if (extra.error !== undefined) {throw extra.error;}
        throw new TypeError(type);
    }
    /* c8 ignore next 4 */
    if (!prevSnapshot) {
        // Unreachable: non-initial always has a previous snapshot.
        throw new TypeError(`error before first commit: ${type}`);
    }

    const navigationId = env.nextNavigationId();
    const url = normalizeRRU(env.adapter.read());
    const snapshot = buildErrorSnapshot(
        navigationId,
        prevSnapshot,
        type,
        extra,
        url,
        navigationType
    );
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
 * @typedef {import('./types.js').Node} Node
 * @typedef {import('./types.js').PreloadContext} PreloadContext
 */

/**
 * Default preload: prefer `leaf.preload(ctx)`, fall back to `leaf.load()`.
 * Both are app-owned metadata on `file()` — not part of the public type.
 *
 * `leaf.preload` receives `ctx` (with `signal`); `leaf.load` is called
 * **without** arguments — `import()` does not accept an `AbortSignal`.
 *
 * Shared by `attachPreload` (hover/focus) and `router.prefetch` (programmatic).
 * Both are opportunistic — errors are handled by the caller, not here.
 *
 * @internal
 * @param {Node} leaf
 * @param {PreloadContext} ctx
 * @returns {void | Promise<unknown>}
 */
function defaultPreload(leaf, ctx) {
    const meta = /** @type {any} */ (leaf);
    if (typeof meta.preload === 'function') {return meta.preload(ctx);}
    if (typeof meta.load === 'function') {return meta.load();}
    return undefined;
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

    /**
     * @param {string} url
     * @returns {Snapshot}
     */
    function navigate(url) {
        return wrap(() => runTransaction('navigate', url, env));
    }

    /**
     * @param {string} url
     * @returns {Snapshot}
     */
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
        if (inTransaction) {
            return;
        }
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
     * @returns {boolean}
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
        if (resolved instanceof Promise) {
            throw new TypeError('resolver-promise');
        }
        if (resolved == null) {
            throw new TypeError('resolver-null');
        }
        if (!isMap(resolved)) {
            throw new TypeError('resolver-invalid');
        }
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

    /**
     * @param {(snapshot: Snapshot) => void} listener
     * @returns {() => void}
     */
    function subscribe(listener) {
        return eventBus.on('commit', ({ snapshot }) => listener(snapshot));
    }

    /**
     * Warm a leaf's `preload` / `load` for `url` without navigating.
     * No-op if `url` is invalid, does not match the **current** map, or
     * the leaf has neither method. Errors are swallowed — prefetch is
     * opportunistic.
     *
     * Does **not** go through the guard layer: prefetch warms whatever map
     * is active; guards only run for actual navigation.
     *
     * `opts.signal` — forwarded to `leaf.preload(ctx)`; `leaf.load()` is
     * signal-free. `prefetch` returns early when `signal.aborted` is already
     * true; a later abort does not cancel an in-flight `leaf.load()`.
     *
     * @param {string} url
     * @param {{ signal?: AbortSignal }} [opts]
     * @returns {Promise<void>}
     */
    async function prefetch(url, opts = {}) {
        if (!isValidRRU(url)) {
            return;
        }
        const snap = currentSnapshot;
        if (!snap) {
            return;
        }
        const normalized = normalizeRRU(url);
        const match = snap.map.match(normalized);
        if (match.status !== 'matched') {
            return;
        }
        const leaf = match.chain.length > 0 ? match.chain[match.chain.length - 1] : undefined;
        if (!leaf) {
            return;
        }
        const signal = opts.signal ?? new AbortController().signal;
        if (signal.aborted) {
            return;
        }
        try {
            await defaultPreload(leaf, { signal });
        } catch {
            /* opportunistic — swallow */
        }
    }

    const router = {
        adapter,
        navigate,
        replace,
        revalidate,
        prefetch,
        back() {
            if (typeof history !== 'undefined') {
                history.back();
            }
        },
        forward() {
            if (typeof history !== 'undefined') {
                history.forward();
            }
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

// @ts-check


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
function createMemoryAdapter(initial = '/') {
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
function createTestRouter(options) {
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

export { createMemoryAdapter, createTestRouter };
