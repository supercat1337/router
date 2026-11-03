// @ts-check

import { isFile, isFolder, parseKey } from './data-model.js';
import { MAP_BRAND } from './internal/symbols.js';
import { buildUrl, match, parseTemplate } from './matching.js';
import { createRoute } from './route.js';

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
 * Precomputes two accelerators alongside validation:
 * - `urlTemplates`: `Map<name, TemplatePart[]>` for O(template) `url()`.
 * - `folderIndex`: `WeakMap<Children, FolderIndex>` for O(1) `match()`.
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
    /** @type {Map<string, readonly string[]>} */
    const leafParams = new Map();
    /** @type {Map<string, UrlTemplate>} */
    const urlTemplates = new Map();
    /** @type {WeakMap<object, FolderIndex>} */
    const folderIndex = new WeakMap();
    collectTree(data, '', seenNames, keyMap, leafParams, urlTemplates, folderIndex, []);

    /** @type {Map<string, Route>} */
    const routeCache = new Map();

    const notFound = options.notFound;
    const rootChildren = /** @type {Children} */ (data);

    /** @type {RouterMap} */
    const map = {
        notFound,
        /**
         * @param {string} name
         * @param {...any} args
         * @returns {string}
         */
        url(name, ...args) {
            return buildUrl(urlTemplates, name, args[0]);
        },
        route(/** @type {string} */ name) {
            const cached = routeCache.get(name);
            if (cached) {
                return /** @type {any} */ (cached);
            }
            const params = leafParams.get(name);
            if (params === undefined) {
                throw new TypeError(`route(): route ${JSON.stringify(name)} not found in this map`);
            }
            const r = createRoute({
                name,
                params,
                buildUrl: p => buildUrl(urlTemplates, name, p),
            });
            routeCache.set(name, r);
            return /** @type {any} */ (r);
        },
        match(url) {
            return match(rootChildren, folderIndex, url, notFound);
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
 * Walk the tree once — validate, collect names/params, build URL templates,
 * and build the `FolderIndex` used by `match()`.
 *
 * @param {Children} children
 * @param {string} pathPrefix
 * @param {Set<string>} seenNames
 * @param {WeakMap<Node, string>} keyMap
 * @param {Map<string, readonly string[]>} leafParams
 * @param {Map<string, UrlTemplate>} urlTemplates
 * @param {WeakMap<object, FolderIndex>} folderIndex
 * @param {readonly string[]} parentParams
 * @returns {void}
 */
function collectTree(
    children,
    pathPrefix,
    seenNames,
    keyMap,
    leafParams,
    urlTemplates,
    folderIndex,
    parentParams
) {
    /** @type {FolderIndex} */
    const index = {
        literals: new Map(),
        param: null,
        wildcard: null,
        index: null,
    };
    folderIndex.set(children, index);

    for (const key of Object.keys(children)) {
        const childPath = pathPrefix + '/' + key;
        const child = children[key];
        if (!isFile(child) && !isFolder(child)) {
            throw new MapValidationError('node-not-constructed', childPath);
        }
        keyMap.set(child, key);
        // `:name` may appear at most once per root-to-leaf chain. A duplicate
        // silently loses the earlier value in `walk` (`{ ...params, name: seg }`
        // — last-wins), while `route.params` and typings still see one entry.
        // Reject it at construction.
        let childParams;
        if (key.startsWith(':')) {
            const paramName = key.slice(1);
            if (parentParams.includes(paramName)) {
                throw new MapValidationError('param-duplicate', childPath);
            }
            childParams = [...parentParams, paramName];
        } else {
            childParams = parentParams;
        }

        if (isFile(child)) {
            if (seenNames.has(child.name)) {
                throw new MapValidationError('name-duplicate', childPath);
            }
            seenNames.add(child.name);
            // Wildcard has no canonical URL — not registered for `url()`.
            if (key !== '*') {
                leafParams.set(child.name, Object.freeze(childParams));
                const templatePath = key === 'index' ? pathPrefix : childPath;
                urlTemplates.set(child.name, Object.freeze(parseTemplate(templatePath)));
            }
        }
        if (isFolder(child)) {
            collectTree(
                child.children,
                childPath,
                seenNames,
                keyMap,
                leafParams,
                urlTemplates,
                folderIndex,
                childParams
            );
        }

        // Populate the per-folder index for O(1) `match()`.
        if (key === '*') {
            index.wildcard = child;
        } else if (key === 'index') {
            index.index = child;
        } else if (key.startsWith(':')) {
            index.param = { name: key.slice(1), node: child };
        } else {
            index.literals.set(key, child);
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
 * @public
 * @param {RouterMap} map
 * @param {string} name
 * @returns {boolean}
 */
export function hasRoute(map, name) {
    if (!map || typeof map !== 'object') {
        return false;
    }
    if (typeof name !== 'string' || name.length === 0) {
        return false;
    }
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
        if (key === '*') {
            continue;
        }
        const child = children[key];
        if (isFile(child)) {
            if (child.name === name) {
                return true;
            }
        } else if (isFolder(child)) {
            if (hasRouteImpl(child.children, name)) {
                return true;
            }
        }
    }
    return false;
}
