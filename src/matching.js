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
 * @typedef {{ lit: string } | { param: string }} TemplatePart
 * @typedef {readonly TemplatePart[]} UrlTemplate
 *
 * @typedef {object} FolderIndex
 * @property {Map<string, Node>} literals  — literal keys → node
 * @property {{ name: string, node: Node } | null} param — the single `:name` at this level
 * @property {Node | null} wildcard — the `*` file, if any
 * @property {Node | null} index — the `index` file, if any
 *
 * @typedef {import('./map.js').kKeysMap} _kKeysMapUnused
 */

/**
 * Match a normalized RRU against a map's root children.
 *
 * @internal
 * @param {Children} rootChildren
 * @param {WeakMap<object, FolderIndex>} folderIndex
 * @param {string} url
 * @param {NotFoundHandler} mapNotFound
 * @returns {MatchResult}
 */
export function match(rootChildren, folderIndex, url, mapNotFound) {
    const normalized = normalizeRRU(url);
    const pathname = extractPathname(normalized);
    const search = parseSearch(extractSearch(normalized));
    const segments = splitSegments(pathname);
    const rootIndex = folderIndex.get(rootChildren);
    const result = rootIndex
        ? walk(folderIndex, rootIndex, segments, [], {}, mapNotFound)
        : /** @type {WalkResult} */ ({
              status: 'notFound',
              chain: [],
              partialParams: {},
              handler: mapNotFound,
          });
    return /** @type {MatchResult} */ ({ ...result, url: normalized, search });
}

/**
 * Build a canonical RRU for a named route.
 *
 * O(template length) — precomputed templates, no tree traversal.
 *
 * @internal
 * @param {Map<string, UrlTemplate>} urlTemplates
 * @param {string} name
 * @param {Record<string, string> | undefined} params
 * @returns {string}
 */
export function buildUrl(urlTemplates, name, params) {
    const template = urlTemplates.get(name);
    if (template === undefined) {
        throw new TypeError(`url(): route ${JSON.stringify(name)} not found in this map`);
    }
    return applyTemplate(template, params);
}

/**
 * Parse a path with `:name` placeholders into a flat template array.
 * Used by `createMap` to precompute URL templates.
 *
 * `'/users/:id/edit'` → `[{ lit: '/users/' }, { param: 'id' }, { lit: '/edit' }]`
 * `'/admin'` → `[{ lit: '/admin' }]`
 *
 * @internal
 * @param {string} path
 * @returns {UrlTemplate}
 */
export function parseTemplate(path) {
    /** @type {TemplatePart[]} */
    const parts = [];
    let litStart = 0;
    let i = 0;
    while (i < path.length) {
        if (path[i] === ':') {
            if (i > litStart) {parts.push({ lit: path.slice(litStart, i) });}
            let j = i + 1;
            while (j < path.length && path[j] !== '/') {j++;}
            parts.push({ param: path.slice(i + 1, j) });
            i = j;
            litStart = j;
        } else {
            i++;
        }
    }
    if (litStart < path.length) {parts.push({ lit: path.slice(litStart) });}
    return parts;
}

/**
 * @param {UrlTemplate} template
 * @param {Record<string, string> | undefined} params
 * @returns {string}
 */
function applyTemplate(template, params) {
    let result = '';
    for (let k = 0; k < template.length; k++) {
        const part = template[k];
        if ('lit' in part) {
            result += part.lit;
        } else {
            const val = params ? params[part.param] : undefined;
            if (typeof val !== 'string' || val === '' || val === '.' || val === '..') {
                throw new TypeError(
                    `url(): missing or invalid param ${JSON.stringify(part.param)}`
                );
            }
            result += encodeURIComponent(val);
        }
    }
    return result;
}

/**
 * Walk the tree using the precomputed `FolderIndex` — no `Object.keys`
 * allocation, no linear scan. O(depth × branching), but branching is
 * constant (one `Map.get` per level).
 *
 * @param {WeakMap<object, FolderIndex>} folderIndex
 * @param {FolderIndex} index
 * @param {string[]} segments
 * @param {Node[]} partialChain
 * @param {Record<string, string>} params
 * @param {NotFoundHandler} mapNotFound
 * @returns {WalkResult}
 */
function walk(folderIndex, index, segments, partialChain, params, mapNotFound) {
    if (segments.length === 0) {
        if (index.index) {
            return {
                status: 'matched',
                chain: [...partialChain, index.index],
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

    // Literal wins over `:name`, `:name` wins over `*` — at every level.
    if (decoded !== null) {
        const literal = index.literals.get(decoded);
        if (literal) {
            if (isFolder(literal)) {
                const childIndex = folderIndex.get(literal.children);
                if (childIndex) {
                    return walk(
                        folderIndex,
                        childIndex,
                        rest,
                        [...partialChain, literal],
                        params,
                        mapNotFound
                    );
                }
            } else if (rest.length === 0) {
                return {
                    status: 'matched',
                    chain: [...partialChain, literal],
                    params: { ...params },
                };
            }
            // Literal leaf with trailing segments — notFound (no backtracking).
            return {
                status: 'notFound',
                chain: [...partialChain, literal],
                partialParams: { ...params },
                handler: handlerFor([...partialChain, literal], mapNotFound),
            };
        }
    }

    // `:name` does not match an empty segment, nor an invalid percent-encoding.
    if (decoded !== null && decoded !== '' && index.param) {
        const child = index.param.node;
        const newParams = { ...params, [index.param.name]: decoded };
        if (isFolder(child)) {
            const childIndex = folderIndex.get(child.children);
            if (childIndex) {
                return walk(
                    folderIndex,
                    childIndex,
                    rest,
                    [...partialChain, child],
                    newParams,
                    mapNotFound
                );
            }
        } else if (rest.length === 0) {
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

    if (index.wildcard) {
        return {
            status: 'matched',
            chain: [...partialChain, index.wildcard],
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
function extractSearch(url) {
    const q = url.indexOf('?');
    return q >= 0 ? url.slice(q + 1) : '';
}

/**
 * Parse a query string (without leading `?`) into a plain object.
 * Duplicate keys → last value wins. Encoded values are decoded.
 *
 * @param {string} query
 * @returns {Record<string, string>}
 */
function parseSearch(query) {
    /** @type {Record<string, string>} */
    const result = {};
    if (!query) {return result;}
    new URLSearchParams(query).forEach((v, k) => {
        result[k] = v;
    });
    return result;
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
    if (pathname === '/') {return [];}
    const stripped = pathname.startsWith('/') ? pathname.slice(1) : pathname;
    return stripped.split('/');
}