// @ts-check

import { isMap, kKeysMap } from './map.js';
import { isValidRRU, normalizeRRU } from './normalize.js';
import { isRedirect } from './redirect.js';
import { buildErrorSnapshot, buildSnapshot, commonChainPrefix } from './snapshot.js';

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
export function runTransaction(source, inputUrl, env) {
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
 * @param {NavigationType} navigationType
 * @param {TransactionEnv} env
 * @returns {Snapshot}
 */
function handleError(type, extra, prevSnapshot, isInitial, navigationType, env) {
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
