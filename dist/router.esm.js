import { EventEmitter } from '@supercat1337/event-emitter';

// @ts-check

/**
 * Runtime brand symbols for nominally-typed artifacts.
 *
 * Exported from an internal module (not from the public entry). This lets
 * `types.ts` reference them as computed keys in branded interfaces, while
 * api-extractor inlines them as non-exported `declare const` declarations
 * in the rolled-up `.d.ts`. Consumers can narrow with `isMap`/`isRedirect`,
 * but cannot forge branded values by hand.
 */

/** @type {unique symbol} */
const FILE_BRAND = Symbol("spa-router.file");

/** @type {unique symbol} */
const FOLDER_BRAND = Symbol("spa-router.folder");

/** @type {unique symbol} */
const MAP_BRAND = Symbol("spa-router.map");

/** @type {unique symbol} */
const REDIRECT_BRAND = Symbol("spa-router.redirect");

// @ts-check


/**
 * @typedef {import('./types.js').FileMeta} FileMeta
 * @typedef {import('./types.js').FolderOptions} FolderOptions
 * @typedef {import('./types.js').FileNode} FileNode
 * @typedef {import('./types.js').FolderNode} FolderNode
 * @typedef {import('./types.js').Children} Children
 * @typedef {import('./types.js').NotFoundHandler} NotFoundHandler
 */

/**
 * @typedef {{ kind: 'wildcard' }
 *   | { kind: 'index' }
 *   | { kind: 'param', name: string }
 *   | { kind: 'literal' }} ParsedKey
 */

/**
 * Create a `file` node.
 *
 * Validates metadata only: `name` non-empty string, `title`/`layout`
 * strings when provided. Uniqueness of `name` across the map is enforced
 * by `createMap`. Returns a frozen branded object; mutation is a contract
 * violation and is not defended against after freeze.
 *
 * @template {FileMeta} M
 * @param {M} meta
 * @returns {import('./types.js').FileNode<M>}
 */
function file(meta) {
    if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
        throw new TypeError('file(meta): meta must be a plain object');
    }
    if (typeof meta.name !== 'string' || meta.name.length === 0) {
        throw new TypeError('file(meta): meta.name must be a non-empty string');
    }
    if (meta.title !== undefined && typeof meta.title !== 'string') {
        throw new TypeError('file(meta): meta.title must be a string when provided');
    }
    if (meta.layout !== undefined && typeof meta.layout !== 'string') {
        throw new TypeError('file(meta): meta.layout must be a string when provided');
    }
    return /** @type {import('./types.js').FileNode<M>} */ (
        Object.freeze(/** @type {any} */ ({ ...meta, [FILE_BRAND]: true }))
    );
}

/**
 * Create a `folder` node.
 *
 * Validates the **subtree** — `options` shape, `notFound` (best-effort
 * sync check), `children` keys, `index`/`*` must be files, `:name`
 * collisions. Tree-wide invariants (name uniqueness, top-level `index`,
 * node construction) are enforced by `createMap`.
 *
 * `notFound` async-ness is checked best-effort via `AsyncFunction`
 * toString inspection; a plain function returning a Promise is not
 * detected here and will surface at runtime as `notFound-promise`.
 *
 * @template {FolderOptions} O
 * @template {Children} C
 * @param {O} options
 * @param {C} children
 * @returns {import('./types.js').FolderNode<O, C>}
 */
function folder(options, children) {
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
        throw new TypeError('folder(options, children): options must be a plain object');
    }
    if (options.notFound !== undefined && typeof options.notFound !== 'function') {
        throw new TypeError(
            'folder(options, children): options.notFound must be a function when provided'
        );
    }
    if (options.notFound !== undefined && isAsyncFunction(options.notFound)) {
        throw new TypeError('folder(options, children): options.notFound must be synchronous');
    }
    if (children === null || typeof children !== 'object' || Array.isArray(children)) {
        throw new TypeError('folder(options, children): children must be a plain object');
    }
    const keys = Object.keys(children);
    if (keys.length === 0) {
        throw new TypeError('folder(options, children): children must be non-empty');
    }

    let hasParamKey = false;
    for (const key of keys) {
        const parsed = parseKey(key);
        if (parsed === null) {
            throw new TypeError(`folder(options, children): invalid key ${JSON.stringify(key)}`);
        }
        const child = children[key];
        if (parsed.kind === 'wildcard' && !isFile(child)) {
            throw new TypeError(
                `folder(options, children): '*' must be a file, got folder at ${JSON.stringify(key)}`
            );
        }
        if (parsed.kind === 'index' && !isFile(child)) {
            throw new TypeError("folder(options, children): 'index' must be a file");
        }
        if (parsed.kind === 'param') {
            if (hasParamKey) {
                throw new TypeError(
                    `folder(options, children): only one ':name' key per level is allowed, got ${JSON.stringify(key)} as second`
                );
            }
            hasParamKey = true;
        }
    }

    return /** @type {import('./types.js').FolderNode<O, C>} */ (
        Object.freeze(
            /** @type {any} */ ({
                ...options,
                children: Object.freeze({ ...children }),
                [FOLDER_BRAND]: true,
            })
        )
    );
}

/**
 * Brand check for a `file` node.
 *
 * @param {unknown} x
 * @returns {x is FileNode}
 */
function isFile(x) {
    return x !== null && typeof x === 'object' && /** @type {any} */ (x)[FILE_BRAND] === true;
}

/**
 * Brand check for a `folder` node.
 *
 * @param {unknown} x
 * @returns {x is FolderNode}
 */
function isFolder(x) {
    return x !== null && typeof x === 'object' && /** @type {any} */ (x)[FOLDER_BRAND] === true;
}

/**
 * Parse a URL-segment key into its kind.
 *
 * Returns `null` for keys that do not pass the syntax:
 * - `*` — wildcard;
 * - `index` — reserved;
 * - `:name` with `name` matching `[a-zA-Z_][a-zA-Z0-9_]*` — parameter;
 * - `[A-Za-z0-9._~-]+`, not `.`/`..` — literal;
 * - everything else — invalid.
 *
 * @internal
 * @param {string} key
 * @returns {ParsedKey | null}
 */
function parseKey(key) {
    if (typeof key !== 'string') return null;
    if (key === '*') return { kind: 'wildcard' };
    if (key === 'index') return { kind: 'index' };
    if (key.startsWith(':')) {
        const name = key.slice(1);
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return null;
        return { kind: 'param', name };
    }
    if (!/^[A-Za-z0-9._~-]+$/.test(key)) return null;
    if (key === '.' || key === '..') return null;
    return { kind: 'literal' };
}

/**
 * Best-effort sync check. `AsyncFunction` toString inspection catches the
 * common case; a plain function returning a Promise is not caught here and
 * is diagnosed at runtime as `notFound-promise`.
 *
 * @param {Function} fn
 * @returns {boolean}
 */
function isAsyncFunction(fn) {
    return Object.prototype.toString.call(fn) === '[object AsyncFunction]';
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
    if (typeof url !== 'string') return false;
    if (url.length === 0) return false;
    if (!url.startsWith('/')) return false;
    if (url.includes('#')) return false;
    return true;
}

// @ts-check


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
function match(rootChildren, url, mapNotFound) {
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
function buildUrl(rootChildren, name, params) {
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
 * Thrown by `createMap` when a tree-wide invariant is violated.
 *
 * `code` identifies the invariant; `path` locates the offending node
 * (`/admin/users/:id`) or key (`:id`); `''` when the violation is at the
 * map level with no specific path. Subtree-shape violations are thrown by
 * `folder` as plain `TypeError` and never reach `createMap`.
 */
class MapValidationError extends Error {
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
function createMap(data, options) {
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
    return Object.freeze(map);
}

/**
 * Brand check for a `RouterMap`.
 *
 * @param {unknown} x
 * @returns {x is RouterMap}
 */
function isMap(x) {
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

// @ts-check


/**
 * @typedef {import('./types.js').RedirectResult} RedirectResult
 */

/**
 * Construct a branded redirect result. Returned from a `notFound` handler
 * to signal "do not commit this URL; go to `url` instead".
 *
 * The returned object is frozen and carries an internal brand symbol;
 * consumers narrow with `isRedirect` before reading `.url`. Branding
 * distinguishes an intentional redirect from a render value that happens
 * to have a `url` field.
 *
 * The cast goes through `unknown` because the runtime symbol in
 * `symbols.js` and the phantom type symbol in `types.ts` are distinct
 * `unique symbol`s by design — see `types.ts` header for rationale.
 *
 * @param {string} url
 * @returns {RedirectResult}
 */
function redirect(url) {
    return /** @type {RedirectResult} */ (
        /** @type {unknown} */ (
            Object.freeze({
                [REDIRECT_BRAND]: true,
                url: String(url),
            })
        )
    );
}

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
function buildErrorSnapshot(navigationId, prev, type, extra, url) {
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
    /* c8 ignore next 3 */
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
    return snapshot;
}

// @ts-check


/**
 * @typedef {import('./types.js').Router} Router
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
 * @param {import('./types.js').CreateRouterOptions} options
 * @returns {Router}
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

    return {
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
        on: eventBus.on,
        off: eventBus.off,
        once: eventBus.once,
        getHistory,
        dryMatch,
        getActiveMap,
        resolveMapFor,
        getRedirectPath,
    };
}

export { MapValidationError, createMap, createRouter, file, folder, isFile, isFolder, isMap, isRedirect, normalizeRRU, redirect };
