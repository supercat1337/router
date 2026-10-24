// @ts-check

import { isFile, isFolder, parseKey } from './data-model.js';
import { MAP_BRAND } from './internal/symbols.js';
import { buildUrl, match } from './matching.js';

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
export const kKeysMap = Symbol('router.map.keysMap');

/**
 * Internal symbol: closes over `rootChildren` for `hasRoute` without
 * leaking tree access to consumers. Populated by `createMap`. Not exported
 * from the public entry.
 * @internal
 */
const kHasRoute = Symbol('router.map.hasRoute');

/**
 * Thrown by `createMap` when a tree-wide invariant is violated.
 *
 * `code` identifies the invariant; `path` locates the offending node
 * (`/admin/users/:id`) or key (`:id`); `''` when the violation is at the
 * map level with no specific path. Subtree-shape violations are thrown by
 * `folder` as plain `TypeError` and never reach `createMap`.
 */
export class MapValidationError extends Error {
    /** @type {MapValidationErrorCode} */
    code;
    /** @type {string} */
    path;

    /**
     * @param {MapValidationErrorCode} code
     * @param {string} path
     * @param {string} [message]
     */
    constructor(code, path, message) {
        super(message ?? defaultMessageFor(code, path));
        this.name = 'MapValidationError';
        this.code = code;
        this.path = path;
    }
}

/**
 * Create an immutable router map.
 *
 * Validates tree-wide invariants — top-level data shape, top-level key
 * syntax, `index` at root, `notFound` presence and function-ness, node
 * construction, name uniqueness. Subtree-shape is already validated by
 * `folder`; this function re-checks the branded-node predicate during
 * traversal but does not re-check key syntax inside folders.
 *
 * The returned object is frozen and branded; it exposes `notFound`, `url`,
 * and `match`. `isMap` is the only supported way to detect one.
 *
 * @param {Record<string, Node>} data
 * @param {{ notFound: NotFoundHandler }} options
 * @returns {RouterMap}
 */
export function createMap(data, options) {
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
        throw new TypeError('createMap(data, options): options must be a plain object');
    }
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
        throw new MapValidationError('data-not-object', '');
    }
    if (options.notFound === undefined) {
        throw new MapValidationError('notFound-missing', '');
    }
    if (typeof options.notFound !== 'function') {
        throw new MapValidationError('notFound-invalid', '');
    }

    for (const key of Object.keys(data)) {
        if (key === 'index') {
            throw new MapValidationError('index-at-root', '/index');
        }
        if (parseKey(key) === null) {
            throw new MapValidationError('data-key-invalid', key);
        }
    }

    /** @type {Set<string>} */
    const seenNames = new Set();
    /** @type {WeakMap<Node, string>} */
    const keyMap = new WeakMap();
    collectTree(/** @type {Children} */ (data), '', seenNames, keyMap);

    const notFound = options.notFound;
    const rootChildren = /** @type {Children} */ (data);

    /** @type {RouterMap} */
    const map = {
        notFound,
        url(name, params) {
            return buildUrl(rootChildren, name, params);
        },
        match(url) {
            return match(rootChildren, url, notFound);
        },
    };
    Object.defineProperty(map, MAP_BRAND, { value: true });
    Object.defineProperty(map, kKeysMap, { value: keyMap });
    Object.defineProperty(map, kHasRoute, {
        value: (/** @type {string} */ n) => hasRouteImpl(rootChildren, n),
    });
    return Object.freeze(map);
}

/**
 * Brand check for a `RouterMap`.
 *
 * @param {unknown} x
 * @returns {x is RouterMap}
 */
export function isMap(x) {
    return x !== null && typeof x === 'object' && /** @type {any} */ (x)[MAP_BRAND] === true;
}

/**
 * Walk the tree for node construction and name uniqueness.
 *
 * @param {Children} children
 * @param {string} pathPrefix
 * @param {Set<string>} seenNames
 * @param {WeakMap<Node, string>} keyMap
 * @returns {void}
 */
function collectTree(children, pathPrefix, seenNames, keyMap) {
    for (const key of Object.keys(children)) {
        const childPath = pathPrefix + '/' + key;
        const child = children[key];
        if (!isFile(child) && !isFolder(child)) {
            throw new MapValidationError('node-not-constructed', childPath);
        }
        keyMap.set(child, key);
        if (isFile(child)) {
            if (seenNames.has(child.name)) {
                throw new MapValidationError('name-duplicate', childPath);
            }
            seenNames.add(child.name);
        }
        if (isFolder(child)) {
            collectTree(child.children, childPath, seenNames, keyMap);
        }
    }
}

/**
 * @param {MapValidationErrorCode} code
 * @param {string} path
 * @returns {string}
 */
function defaultMessageFor(code, path) {
    const where = path ? ` at ${path}` : '';
    return `Invalid map${where}: ${code}`;
}

/**
 * Check whether a route with a canonical URL exists for `name` in `map`.
 *
 * Returns `true` iff `map.url(name, ...)` would not throw for the reason
 * "route not found" — i.e. there is a non-wildcard leaf with
 * `name === name`. Parameter validity is **not** checked: `hasRoute` may
 * return `true` while `url(name)` still throws for missing or invalid
 * `:name` params.
 *
 * Wildcard-only routes (`*`) have no canonical URL and return `false`.
 * Non-map / non-string / empty-string inputs return `false`.
 *
 * Intended for one-shot validation of route names from config / feature
 * flags / external sources at data-load time. O(N) in tree size;
 * no memoization — do not call per render.
 *
 * @public
 * @param {RouterMap} map
 * @param {string} name
 * @returns {boolean}
 */
export function hasRoute(map, name) {
    if (!map || typeof map !== 'object') return false;
    if (typeof name !== 'string' || name.length === 0) return false;
    const fn = /** @type {any} */ (map)[kHasRoute];
    return typeof fn === 'function' ? fn(name) : false;
}

/**
 * @internal
 * @param {Children} children
 * @param {string} name
 * @returns {boolean}
 */
function hasRouteImpl(children, name) {
    for (const key of Object.keys(children)) {
        if (key === '*') continue;
        const child = children[key];
        if (isFile(child)) {
            if (child.name === name) return true;
        } else if (isFolder(child)) {
            if (hasRouteImpl(child.children, name)) return true;
        }
    }
    return false;
}
