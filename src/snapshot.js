// @ts-check

import { normalizeRRU } from './normalize.js';

/**
 * @typedef {import('./types.js').Snapshot} Snapshot
 * @typedef {import('./types.js').Node} Node
 * @typedef {import('./types.js').RouterMap} RouterMap
 * @typedef {import('./types.js').NavigationErrorType} NavigationErrorType
 */

/**
 * The source of `params[name]` for `urlPrefix(:name)` regardless of
 * `status`: `params` for matched, `partialParams` otherwise. Central
 * helper for chain comparison.
 *
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
 * Compute `urlPrefix` for each node in the chain. `urlPrefix` is not a
 * node field — it is derived per-snapshot from `(chain, params|partialParams,
 * snapshot.url)` and the node's key in its parent's `children`.
 *
 * The literal `urlPrefix` is decoded (= encoded, URL-safe by validation).
 * `:name` is decoded from params. `index` equals parent's prefix. `*`
 * equals the full encoded pathname of `snapshot.url` (per
 * `06-snapshot-events.md#url-prefix`).
 *
 * @internal
 * @param {Node[]} chain
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
 * Length of the common chain prefix between two snapshots, compared by
 * `urlPrefix` (string equality, case-sensitive). The first pair with
 * different prefixes is the divergence point. If one chain is empty or no
 * common pair exists — `0`.
 *
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
 * Build a matched/notFound snapshot. `notFoundResult` is attached only for
 * `notFound`.
 *
 * @internal
 * @param {number} navigationId
 * @param {RouterMap} map
 * @param {'matched' | 'notFound'} status
 * @param {Node[]} chain
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
    /** @type {Snapshot} */
    const snap = {
        navigationId,
        map,
        status,
        chain,
        params,
        partialParams,
        url,
    };
    if (status === 'notFound') snap.notFoundResult = notFoundResult;
    return snap;
}

/**
 * Build an error snapshot anchored to the previous committed snapshot.
 * `map` and `chain` are from `prev`; `params` is `{}`; `partialParams`
 * is `chainParams(prev)` so `urlPrefix(:name)` stays computable.
 *
 * @internal
 * @param {number} navigationId
 * @param {Snapshot} prev
 * @param {NavigationErrorType} type
 * @param {{ error?: unknown, attemptedUrl: string, path?: string[], partialChain: Node[], partialParams: Record<string, string> }} extra
 * @param {string} url
 * @returns {Snapshot}
 */
export function buildErrorSnapshot(navigationId, prev, type, extra, url) {
    return {
        navigationId,
        map: prev.map,
        status: 'error',
        chain: prev.chain,
        params: {},
        partialParams: chainParams(prev),
        url,
        error: {
            type,
            error: extra.error,
            attemptedUrl: extra.attemptedUrl,
            path: extra.path,
            partialChain: extra.partialChain,
            partialParams: extra.partialParams,
        },
    };
}
