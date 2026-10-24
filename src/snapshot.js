// @ts-check

import { normalizeRRU } from './normalize.js';

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
export function chainParams(snapshot) {
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
export function urlPrefixes(chain, snapshot, keysMap) {
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
export function commonChainPrefix(prev, next, getKeysMap) {
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
export function buildSnapshot(
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
export function buildErrorSnapshot(navigationId, prev, type, extra, url) {
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
