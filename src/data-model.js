// @ts-check

import { FILE_BRAND, FOLDER_BRAND } from './internal/symbols.js';

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
export function file(meta) {
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
 * Validates the **subtree** — `children` shape and keys (literal, `:name`,
 * `*`, `index`), `index`/`*` must be files, `:name` collisions; and
 * `options.notFound` (best-effort sync check). Tree-wide invariants (name
 * uniqueness, top-level `index`, node construction) are enforced by
 * `createMap`.
 *
 * `options` is optional (default `{}`). When `options.notFound` is omitted,
 * the nearest ancestor with a `notFound` handles the miss, up to
 * `map.notFound`.
 *
 * `options.notFound` async-ness is checked best-effort via `AsyncFunction`
 * toString inspection; a plain function returning a Promise is not
 * detected here and will surface at runtime as `notFound-promise`.
 *
 * @template {Children} C
 * @param {C} children
 * @param {FolderOptions} [options]
 * @returns {import('./types.js').FolderNode<FolderOptions, C>}
 */
export function folder(children, options = {}) {
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
        throw new TypeError('folder(children, options): options must be a plain object');
    }
    if (options.notFound !== undefined && typeof options.notFound !== 'function') {
        throw new TypeError(
            'folder(children, options): options.notFound must be a function when provided'
        );
    }
    if (options.notFound !== undefined && isAsyncFunction(options.notFound)) {
        throw new TypeError('folder(children, options): options.notFound must be synchronous');
    }
    if (children === null || typeof children !== 'object' || Array.isArray(children)) {
        throw new TypeError('folder(children, options): children must be a plain object');
    }
    const keys = Object.keys(children);
    if (keys.length === 0) {
        throw new TypeError('folder(children, options): children must be non-empty');
    }

    let hasParamKey = false;
    for (const key of keys) {
        const parsed = parseKey(key);
        if (parsed === null) {
            throw new TypeError(`folder(children, options): invalid key ${JSON.stringify(key)}`);
        }
        const child = children[key];
        if (parsed.kind === 'wildcard' && !isFile(child)) {
            throw new TypeError(
                `folder(children, options): '*' must be a file, got folder at ${JSON.stringify(key)}`
            );
        }
        if (parsed.kind === 'index' && !isFile(child)) {
            throw new TypeError("folder(children, options): 'index' must be a file");
        }
        if (parsed.kind === 'param') {
            if (hasParamKey) {
                throw new TypeError(
                    `folder(children, options): only one ':name' key per level is allowed, got ${JSON.stringify(key)} as second`
                );
            }
            hasParamKey = true;
        }
    }

    return /** @type {import('./types.js').FolderNode<FolderOptions, C>} */ (
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
export function isFile(x) {
    return x !== null && typeof x === 'object' && /** @type {any} */ (x)[FILE_BRAND] === true;
}

/**
 * Brand check for a `folder` node.
 *
 * @param {unknown} x
 * @returns {x is FolderNode}
 */
export function isFolder(x) {
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
export function parseKey(key) {
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
