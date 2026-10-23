// @ts-check

import { isFolder } from './data-model.js';
import { normalizeRRU } from './normalize.js';

/**
 * @typedef {import('./types.js').Node} Node
 * @typedef {import('./types.js').Children} Children
 * @typedef {import('./types.js').NotFoundHandler} NotFoundHandler
 * @typedef {import('./types.js').MatchResult} MatchResult
 * @typedef {{ status: 'matched', chain: Node[], params: Record<string, string> }
 *   | { status: 'notFound', chain: Node[], partialParams: Record<string, string>, handler: NotFoundHandler }} WalkResult
 */

/**
 * Match a normalized RRU against a map's root children.
 *
 * @internal
 * @param {Children} rootChildren
 * @param {string} url
 * @param {NotFoundHandler} mapNotFound
 * @returns {MatchResult}
 */
export function match(rootChildren, url, mapNotFound) {
    const normalized = normalizeRRU(url);
    const pathname = extractPathname(normalized);
    const segments = splitSegments(pathname);
    const result = walk(rootChildren, segments, [], {}, mapNotFound);
    return /** @type {MatchResult} */ ({ ...result, url: normalized });
}

/**
 * Build a canonical RRU for a named route.
 *
 * @internal
 * @param {Children} rootChildren
 * @param {string} name
 * @param {Record<string, string> | undefined} params
 * @returns {string}
 */
export function buildUrl(rootChildren, name, params) {
    const result = buildUrlImpl(rootChildren, name, params, '');
    if (result === null) {
        throw new TypeError(`url(): route ${JSON.stringify(name)} not found in this map`);
    }
    return result;
}

/**
 * @param {Children} children
 * @param {string[]} segments
 * @param {Node[]} partialChain
 * @param {Record<string, string>} params
 * @param {NotFoundHandler} mapNotFound
 * @returns {WalkResult}
 */
function walk(children, segments, partialChain, params, mapNotFound) {
    if (segments.length === 0) {
        if (Object.prototype.hasOwnProperty.call(children, 'index')) {
            const child = children['index'];
            return {
                status: 'matched',
                chain: [...partialChain, child],
                params: { ...params },
            };
        }
        return {
            status: 'notFound',
            chain: partialChain,
            partialParams: { ...params },
            handler: handlerFor(partialChain, mapNotFound),
        };
    }

    const seg = segments[0];
    const rest = segments.slice(1);
    const decoded = tryDecode(seg);

    if (decoded !== null) {
        for (const key of Object.keys(children)) {
            if (!isLiteralKey(key)) continue;
            if (key !== decoded) continue;
            const child = children[key];
            if (isFolder(child)) {
                return walk(child.children, rest, [...partialChain, child], params, mapNotFound);
            }
            if (rest.length === 0) {
                return {
                    status: 'matched',
                    chain: [...partialChain, child],
                    params: { ...params },
                };
            }
            return {
                status: 'notFound',
                chain: [...partialChain, child],
                partialParams: { ...params },
                handler: handlerFor([...partialChain, child], mapNotFound),
            };
        }
    }

    if (decoded !== null && decoded !== '') {
        for (const key of Object.keys(children)) {
            if (!key.startsWith(':')) continue;
            const paramName = key.slice(1);
            const child = children[key];
            const newParams = { ...params, [paramName]: decoded };
            if (isFolder(child)) {
                return walk(child.children, rest, [...partialChain, child], newParams, mapNotFound);
            }
            if (rest.length === 0) {
                return {
                    status: 'matched',
                    chain: [...partialChain, child],
                    params: newParams,
                };
            }
            return {
                status: 'notFound',
                chain: [...partialChain, child],
                partialParams: newParams,
                handler: handlerFor([...partialChain, child], mapNotFound),
            };
        }
    }

    if (Object.prototype.hasOwnProperty.call(children, '*')) {
        const child = children['*'];
        return {
            status: 'matched',
            chain: [...partialChain, child],
            params: { ...params },
        };
    }

    return {
        status: 'notFound',
        chain: partialChain,
        partialParams: { ...params },
        handler: handlerFor(partialChain, mapNotFound),
    };
}

/**
 * @param {Node[]} chain
 * @param {NotFoundHandler} mapNotFound
 * @returns {NotFoundHandler}
 */
function handlerFor(chain, mapNotFound) {
    for (let i = chain.length - 1; i >= 0; i--) {
        const node = chain[i];
        if (isFolder(node) && typeof node.notFound === 'function') {
            return node.notFound;
        }
    }
    return mapNotFound;
}

/**
 * @param {string} key
 * @returns {boolean}
 */
function isLiteralKey(key) {
    return key !== '*' && !key.startsWith(':') && key !== 'index';
}

/**
 * @param {string} seg
 * @returns {string | null}
 */
function tryDecode(seg) {
    try {
        return decodeURIComponent(seg);
    } catch {
        return null;
    }
}

/**
 * @param {string} url
 * @returns {string}
 */
function extractPathname(url) {
    const q = url.indexOf('?');
    return q >= 0 ? url.slice(0, q) : url;
}

/**
 * `/a/b` → `['a', 'b']`; `/` → `[]`; `/a//b` → `['a', '', 'b']`;
 * `//users` → `['', 'users']`.
 *
 * @param {string} pathname
 * @returns {string[]}
 */
function splitSegments(pathname) {
    if (pathname === '/') return [];
    const stripped = pathname.startsWith('/') ? pathname.slice(1) : pathname;
    return stripped.split('/');
}

/**
 * Recursive search for a leaf with `name === target`. Returns the encoded
 * RRU or `null` if no such leaf exists.
 *
 * **Invalid `:name` value aborts the branch entirely** (`continue`).
 * Entering a folder without the segment would produce a malformed path.
 * Uniqueness of `name` (enforced by `createMap`) guarantees that if the
 * target exists, it is found via some other, valid branch, or via this
 * branch once params are supplied — otherwise `buildUrl` throws
 * `TypeError`.
 *
 * @param {Children} children
 * @param {string} name
 * @param {Record<string, string> | undefined} params
 * @param {string} pathSoFar
 * @returns {string | null}
 */
function buildUrlImpl(children, name, params, pathSoFar) {
    for (const key of Object.keys(children)) {
        if (key === '*') continue;

        /** @type {string | null} */
        let segment = null;

        if (key === 'index') {
            segment = null;
        } else if (key.startsWith(':')) {
            const paramName = key.slice(1);
            const val = params && params[paramName];
            if (typeof val !== 'string' || val === '' || val === '.' || val === '..') {
                continue;
            }
            segment = encodeURIComponent(val);
        } else {
            segment = key;
        }

        const newPath = segment === null ? pathSoFar : pathSoFar + '/' + segment;
        const child = children[key];

        if (isFolder(child)) {
            const result = buildUrlImpl(child.children, name, params, newPath);
            if (result !== null) return result;
        } else if (child.name === name) {
            return newPath;
        }
    }
    return null;
}
